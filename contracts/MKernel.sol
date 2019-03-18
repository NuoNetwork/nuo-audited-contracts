pragma solidity 0.4.24;

import "./lib/dappsys/DSThing.sol";
import "./lib/dappsys/DSStop.sol";
import "./lib/tokens/ERC20.sol";
import "./Account.sol";
import "./Escrow.sol";
import "./Reserve.sol";
import "./ExchangeConnector.sol";
import "./Utils.sol";
import "./Utils2.sol";
import "./ErrorUtils.sol";

/**
 * @author Siddharth Verma (sid@nuofox.com)
 * @author Rohit Soni (rohit@nuofox.com)
 */

contract MKernel is DSStop, DSThing, Utils, Utils2, ErrorUtils {
    
    Escrow public escrow;
    AccountFactory public accountFactory;
    Reserve public reserve;
    address public feeWallet;
    Config public config;
    
    constructor
    (
        Escrow _escrow,
        AccountFactory _accountFactory,
        Reserve _reserve,
        address _feeWallet,
        Config _config
    ) 
    public 
    {
        escrow = _escrow;
        accountFactory = _accountFactory;
        reserve = _reserve;
        feeWallet = _feeWallet;
        config = _config;
    }

    function setEscrow(Escrow _escrow) 
        public 
        note 
        auth
        addressValid(_escrow)
    {
        escrow = _escrow;
    }

    function setAccountFactory(AccountFactory _accountFactory)
        public 
        note 
        auth
        addressValid(_accountFactory)
    {
        accountFactory = _accountFactory;
    }

    function setReserve(Reserve _reserve)
        public 
        note 
        auth
        addressValid(_reserve)
    {
        reserve = _reserve;
    }

    function setConfig(Config _config)
        public 
        note 
        auth
        addressValid(_config)
    {
        config = _config;
    }

    function setFeeWallet(address _feeWallet)
        public 
        note 
        auth
        addressValid(_feeWallet)
    {
        feeWallet = _feeWallet;
    }
    
    event LogOrderCreated(
        bytes32 indexed orderHash,
        uint tradeAmount,
        uint expirationTimestamp
    );

    event LogOrderLiquidatedByUser(
        bytes32 indexed orderHash
    );

    event LogOrderStoppedAtProfit(
        bytes32 indexed orderHash
    );

    event LogOrderDefaulted(
        bytes32 indexed orderHash,
        string reason
    );

    event LogNoActionPerformed(
        bytes32 indexed orderHash
    );

    event LogOrderSettlement(
        bytes32 indexed orderHash,
        uint valueRepaid,
        uint reserveProfit,
        uint reserveLoss,
        uint collateralLeft,
        uint userProfit,
        uint fee
    );

    event LogOrderDefaultWithSurplus(
        bytes32 indexed orderHash,
        address forToken,
        address token
    );

    struct Order {
        address account;
        address byUser;
        address principalToken; 
        address collateralToken;
        Trade trade;
        uint principalAmount;
        uint collateralAmount;
        uint premium;
        uint expirationTimestamp;
        uint duration;
        uint salt;
        uint fee;
        uint createdTimestamp;
        bytes32 orderHash;
    }

    struct Trade {
        address tradeToken;
        address closingToken;
        address exchangeConnector; //stores initial and then just used to pass around params
        uint stopProfit;
        uint stopLoss;
    }

    bytes32[] public orders;
    mapping (bytes32 => Order) public hashToOrder;
    mapping (bytes32 => bool) public isOrder;
    mapping (address => bytes32[]) public accountToOrders;

    mapping (bytes32 => uint) public initialTradeAmount;
    mapping (bytes32 => bool) public isLiquidated;
    mapping (bytes32 => bool) public isDefaulted;

    modifier onlyAdmin() {
        require(config.isAdminValid(msg.sender), "MKernel::_ INVALID_ADMIN_ACCOUNT");
        _;
    }


    function createOrder
    (
        address[6] _orderAddresses,
        uint[8] _orderValues,
        address _exchangeConnector,
        bytes _signature
    )    
        external
        note
        onlyAdmin
        whenNotStopped
        addressValid(_exchangeConnector)
    {
        Order memory order = _composeOrder(_orderAddresses, _orderValues);
        address signer = _recoverSigner(order.orderHash, _signature);
        order.trade.exchangeConnector = _exchangeConnector;

        if(signer != order.byUser) {
            emit LogErrorWithHintBytes32(order.orderHash, "MKernel::createOrder","SIGNER_NOT_ORDER_CREATOR");
            return;
        }

        if(isOrder[order.orderHash]){
            emit LogErrorWithHintBytes32(order.orderHash, "MKernel::createOrder","ORDER_ALREADY_EXISTS");
            return;
        }

        if(!accountFactory.isAccount(order.account)){
            emit LogErrorWithHintBytes32(order.orderHash, "MKernel::createOrder","INVALID_ORDER_ACCOUNT");
            return;
        }

        if(!Account(order.account).isUser(signer)) {
            emit LogErrorWithHintBytes32(order.orderHash, "MKernel::createOrder","SIGNER_NOT_AUTHORIZED_WITH_ACCOUNT");
            return;
        }

        if(!_isOrderValid(order)){
            emit LogErrorWithHintBytes32(order.orderHash, "MKernel::createOrder","INVALID_ORDER_PARAMETERS");
            return;
        }

        if(ERC20(order.collateralToken).balanceOf(order.account) < order.collateralAmount){
            emit LogErrorWithHintBytes32(order.orderHash, "MKernel::createOrder","INSUFFICIENT_COLLATERAL_IN_ACCOUNT");
            return;
        }

        if(ERC20(order.principalToken).balanceOf(reserve.escrow()) < order.principalAmount){
            emit LogErrorWithHintBytes32(order.orderHash, "MKernel::createOrder","INSUFFICIENT_FUNDS_IN_RESERVE");
            return;
        }

        if(!_isTradeFeasible(order, order.principalToken, order.trade.tradeToken, order.principalAmount))
        {
            emit LogErrorWithHintBytes32(order.orderHash, "MKernel::createOrder","TRADE_NOT_FEASIBLE");
            return;
        }        

        
        orders.push(order.orderHash);
        hashToOrder[order.orderHash] = order;
        isOrder[order.orderHash] = true;
        accountToOrders[order.account].push(order.orderHash);

        escrow.transferFromAccount(order.account, order.collateralToken, address(escrow), order.collateralAmount);
        reserve.release(order.principalToken, address(escrow), order.principalAmount);
    
        (initialTradeAmount[order.orderHash],) = _tradeWithFixedInput(
            order,
            ERC20(order.principalToken),
            ERC20(order.trade.tradeToken),
            order.principalAmount
        );

        emit LogOrderCreated(
            order.orderHash,
            initialTradeAmount[order.orderHash],
            order.expirationTimestamp
        );
        

    }

    function liquidateOrder
    (
        bytes32 _orderHash,
        address _exchangeConnector,
        bytes _signature
    ) 
        external
        note
        onlyAdmin
        addressValid(_exchangeConnector)
    {
        if(!isOrder[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::liquidateOrder","ORDER_DOES_NOT_EXIST");
            return;
        }
        
        if(isLiquidated[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::liquidateOrder","ORDER_ALREADY_LIQUIDATED");
            return;
        }

        if(isDefaulted[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::liquidateOrder","ORDER_ALREADY_DEFAULTED");
            return;
        }

        bytes32 liquidateOrderHash = _generateLiquidateOrderHash(_orderHash);
        address signer = _recoverSigner(liquidateOrderHash, _signature);

        Order memory order = hashToOrder[_orderHash];
        order.trade.exchangeConnector = _exchangeConnector;
        
        if(!Account(order.account).isUser(signer)){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::liquidateOrder", "SIGNER_NOT_AUTHORIZED_WITH_ACCOUNT");
            return;
        }

        if(ERC20(order.trade.tradeToken).balanceOf(address(escrow)) < initialTradeAmount[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::liquidateOrder", "INSUFFICIENT_TRADE_BALANCE_IN_ESCROW");
            return;
        }

        if(ERC20(order.collateralToken).balanceOf(address(escrow)) < order.collateralAmount){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::liquidateOrder", "INSUFFICIENT_COLLATERAL_BALANCE_IN_ESCROW");
            return;
        }

        isLiquidated[order.orderHash] = true;
        _performOrderLiquidation(order);

        emit LogOrderLiquidatedByUser(_orderHash);
    }

    function processTradeForExpiry
    (
        bytes32 _orderHash,
        address _exchangeConnector
    )
        external
        note
        onlyAdmin
        addressValid(_exchangeConnector)
    {
        if(!isOrder[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForExpiry","ORDER_DOES_NOT_EXIST");
            return;
        }

        if(isLiquidated[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForExpiry","ORDER_ALREADY_LIQUIDATED");
            return;
        }

        if(isDefaulted[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForExpiry","ORDER_ALREADY_DEFAULTED");
            return;
        }
        

        Order memory order = hashToOrder[_orderHash];
        order.trade.exchangeConnector = _exchangeConnector;

        if(ERC20(order.trade.tradeToken).balanceOf(address(escrow)) < initialTradeAmount[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForExpiry", "INSUFFICIENT_TRADE_BALANCE_IN_ESCROW");
            return;
        }

        if(ERC20(order.collateralToken).balanceOf(address(escrow)) < order.collateralAmount){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForExpiry", "INSUFFICIENT_COLLATERAL_BALANCE_IN_ESCROW");
            return;
        }

        if(now > order.expirationTimestamp) {
            isDefaulted[order.orderHash] = true;
            _performOrderLiquidation(order);
            emit LogOrderDefaulted(order.orderHash, "MKERNEL_DUE_DATE_PASSED");
            return;
        }

        emit LogErrorWithHintBytes32(order.orderHash, "MKernel::processTradeForExpiry", "NO_ACTION_PERFORMED");
    }


    function processTradeForStopLoss
    (
        bytes32 _orderHash,
        address _exchangeConnector,
        uint[2] _tokenPrices,
        uint _bufferInPrincipal
    )
        external
        note
        onlyAdmin
        addressValid(_exchangeConnector)
    {   
        if(!isOrder[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopLoss","ORDER_DOES_NOT_EXIST");
            return;
        }

        if(isLiquidated[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopLoss","ORDER_ALREADY_LIQUIDATED");
            return;
        }

        if(isDefaulted[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopLoss","ORDER_ALREADY_DEFAULTED");
            return;
        }

        Order memory order = hashToOrder[_orderHash];
        order.trade.exchangeConnector = _exchangeConnector;

        if(ERC20(order.trade.tradeToken).balanceOf(address(escrow)) < initialTradeAmount[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopLoss", "INSUFFICIENT_TRADE_BALANCE_IN_ESCROW");
            return;
        }

        if(ERC20(order.collateralToken).balanceOf(address(escrow)) < order.collateralAmount){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopLoss", "INSUFFICIENT_COLLATERAL_BALANCE_IN_ESCROW");
            return;
        }

        if(!_isPositionAboveStopLoss(order, _tokenPrices, _bufferInPrincipal)) {
            isDefaulted[order.orderHash] = true;
            _performOrderLiquidation(order);
            emit LogOrderDefaulted(order.orderHash, "MKERNEL_ORDER_UNSAFE");
            return;
        }

        emit LogErrorWithHintBytes32(order.orderHash, "MKernel::processTradeForStopLoss", "NO_ACTION_PERFORMED");
    }

    function processTradeForStopProfit
    (
        bytes32 _orderHash,
        address _exchangeConnector,
        uint[2] _tokenPrices,
        uint _bufferInPrincipal
    )
        external
        note
        onlyAdmin
        addressValid(_exchangeConnector)
    {   
        if(!isOrder[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopProfit","ORDER_DOES_NOT_EXIST");
            return;
        }

        if(isLiquidated[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopProfit","ORDER_ALREADY_LIQUIDATED");
            return;
        }

        if(isDefaulted[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopProfit","ORDER_ALREADY_DEFAULTED");
            return;
        }

        Order memory order = hashToOrder[_orderHash];
        order.trade.exchangeConnector = _exchangeConnector;

        if(ERC20(order.trade.tradeToken).balanceOf(address(escrow)) < initialTradeAmount[_orderHash]){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopProfit", "INSUFFICIENT_TRADE_BALANCE_IN_ESCROW");
            return;
        }

        if(ERC20(order.collateralToken).balanceOf(address(escrow)) < order.collateralAmount){
            emit LogErrorWithHintBytes32(_orderHash, "MKernel::processTradeForStopProfit", "INSUFFICIENT_COLLATERAL_BALANCE_IN_ESCROW");
            return;
        }

        
        
        if(_isPositionAboveStopProfit(order, _tokenPrices, _bufferInPrincipal)) {
            isLiquidated[order.orderHash] = true;
            _performOrderLiquidation(order);
            emit LogOrderStoppedAtProfit(order.orderHash);
            return;
        }

        emit LogErrorWithHintBytes32(order.orderHash, "MKernel::processTradeForStopProfit", "NO_ACTION_PERFORMED");
    }

    function _performOrderLiquidation(Order _order) 
        internal
    {   
        uint tradeAmount = initialTradeAmount[_order.orderHash];
        uint valueToRepay = add(_order.principalAmount, _order.premium);
        uint valueToRepayWithFee = add(valueToRepay, _order.fee);
    
        uint principalFromTrade = 0;
        uint principalFromCollateral = 0;
        uint principalNeededFromCollateral = 0;
        uint collateralLeft = 0;
        uint userProfit = 0;
        uint totalPrincipalAcquired = 0;
        uint orderFee = 0;
        

        if (!_isTradeFeasible(_order, _order.trade.tradeToken, _order.principalToken, tradeAmount))
        {
            reserve.lockSurplus(escrow, _order.principalToken, _order.trade.tradeToken, tradeAmount);
            reserve.lockSurplus(escrow, _order.principalToken, _order.collateralToken, _order.collateralAmount);

            emit LogOrderDefaultWithSurplus(_order.orderHash, _order.principalToken, _order.trade.tradeToken);
            emit LogOrderDefaultWithSurplus(_order.orderHash, _order.principalToken, _order.collateralToken);
        } else {
            (principalFromTrade,) = _tradeWithFixedInput(_order, _order.trade.tradeToken, _order.principalToken, tradeAmount);

            if(principalFromTrade >= valueToRepayWithFee) {
                userProfit = sub(principalFromTrade, valueToRepayWithFee);
                orderFee = _order.fee;
                _performSettlement(_order, valueToRepay, _order.premium, 0, _order.collateralAmount, userProfit, orderFee);
            } else {

                principalNeededFromCollateral = sub(valueToRepayWithFee, principalFromTrade);

                if (_order.collateralToken == _order.principalToken) {
                    principalFromCollateral = principalNeededFromCollateral;

                    if(_order.collateralAmount >= principalNeededFromCollateral) {
                        collateralLeft = sub(_order.collateralAmount, principalNeededFromCollateral);
                    }

                } else {
                    if(!_isTradeFeasible(_order, _order.collateralToken, _order.principalToken, _order.collateralAmount))
                    {
                        reserve.lockSurplus(escrow, _order.principalToken, _order.collateralToken, _order.collateralAmount);
                        emit LogOrderDefaultWithSurplus(_order.orderHash, _order.principalToken, _order.collateralToken);
                        _performSettlementAfterAllPossibleLiquidations(_order, principalFromTrade);
                        return;
                    } else {
                        (principalFromCollateral, collateralLeft) = _tradeWithFixedOutput(_order, _order.collateralToken, _order.principalToken, _order.collateralAmount, principalNeededFromCollateral);
                    }
                }

                if(principalFromCollateral >= principalNeededFromCollateral) {
                    orderFee = _order.fee;
                    _performSettlement(_order, valueToRepay, _order.premium, 0, collateralLeft, 0, orderFee);
                } else {
                    totalPrincipalAcquired = add(principalFromTrade, principalFromCollateral);
                    _performSettlementAfterAllPossibleLiquidations(_order, totalPrincipalAcquired);
                }
            }
        }               
    }

    function _tradeWithFixedInput(Order _order, address _srcToken, address _destToken, uint _srcTokenValue)
        internal
        returns (uint _destTokenValue, uint _srcTokenValueLeft)
    {
        ExchangeConnector exchangeConnector = ExchangeConnector(_order.trade.exchangeConnector);
        return exchangeConnector.tradeWithInputFixed(
                    escrow,
                    _srcToken,
                    _destToken,
                    _srcTokenValue
        );
    }

    function _tradeWithFixedOutput(Order _order, address _srcToken, address _destToken, uint _srcTokenValue, uint _maxDestTokenValue)
        internal
        returns (uint _destTokenValue, uint _srcTokenValueLeft)
    {
        ExchangeConnector exchangeConnector = ExchangeConnector(_order.trade.exchangeConnector);
        return exchangeConnector.tradeWithOutputFixed(
                    escrow,
                    _srcToken,
                    _destToken,
                    _srcTokenValue,
                    _maxDestTokenValue
        );
    }

    function _isTradeFeasible(Order _order, address _srcToken, address _destToken, uint _srcTokenValue)
        internal
        view
        returns (bool)
    {   
        ExchangeConnector exchangeConnector = ExchangeConnector(_order.trade.exchangeConnector);
        return exchangeConnector.isTradeFeasible(_srcToken, _destToken, _srcTokenValue);
    }

    function _performSettlementAfterAllPossibleLiquidations
    (
        Order _order,
        uint _totalPrincipalAcquired
    )
        internal
    {
        uint valueToRepay = add(_order.principalAmount, _order.premium);

        if(_totalPrincipalAcquired >= valueToRepay) {
            _performSettlement(_order, valueToRepay, _order.premium, 0, 0, 0, sub(_totalPrincipalAcquired, valueToRepay));
        } else if((_totalPrincipalAcquired < valueToRepay) && (_totalPrincipalAcquired >= _order.principalAmount)) {
            _performSettlement(_order, _totalPrincipalAcquired, sub(_totalPrincipalAcquired, _order.principalAmount), 0, 0, 0, 0);
        } else {
            _performSettlement(_order, _totalPrincipalAcquired, 0, sub(_order.principalAmount, _totalPrincipalAcquired), 0, 0, 0);
        }

    }

    function _performSettlement
    (
        Order _order,
        uint _valueRepaid,
        uint _reserveProfit,
        uint _reserveLoss,
        uint _collateralLeft,
        uint _userProfit,
        uint _fee
    ) 
        internal 
    {
        uint closingFromPrincipal = 0;
        uint userEarnings = _userProfit;

        if(_fee > 0){
            escrow.transfer(_order.principalToken, feeWallet, _fee);
        }
        
        reserve.lock(_order.principalToken, escrow, _valueRepaid, _reserveProfit, _reserveLoss);
        
        if(_collateralLeft > 0) {
            escrow.transfer(_order.collateralToken, _order.account, _collateralLeft);    
        }

        if(_userProfit > 0) {
            if(_order.trade.closingToken == _order.principalToken || !_isTradeFeasible(_order, _order.principalToken, _order.trade.closingToken, _userProfit)) {
                escrow.transfer(_order.principalToken, _order.account, _userProfit);
            } else {
                (closingFromPrincipal,) = _tradeWithFixedInput(_order, _order.principalToken, _order.trade.closingToken, _userProfit);
                escrow.transfer(_order.trade.closingToken, _order.account, closingFromPrincipal);
                userEarnings = closingFromPrincipal;
            }
        }

        emit LogOrderSettlement(_order.orderHash, _valueRepaid, _reserveProfit, _reserveLoss, _collateralLeft, userEarnings, _fee);
    }

    function _isPositionAboveStopLoss(Order _order, uint[2] _tokenPrices, uint _bufferInPrincipal)
        internal 
        view
        returns (bool)
    {
        uint principalPerCollateral = _tokenPrices[0]; 
        uint principalPerTrade = _tokenPrices[1];
        uint tradeAmount = initialTradeAmount[_order.orderHash];

        uint valueToRepayWithFee = add(add(_order.principalAmount, _order.premium), _order.fee);
        uint totalCollateralValueInPrincipal = div(mul(_order.collateralAmount, principalPerCollateral), WAD);
        uint totalTradeValueInPrincipal = div(mul(tradeAmount, principalPerTrade), WAD);

        uint bufferValue = div(mul(_order.principalAmount, _bufferInPrincipal), WAD);
        uint minValueReq = mul(div(sub(WAD, _order.trade.stopLoss), WAD), totalCollateralValueInPrincipal);

        if(add(valueToRepayWithFee, bufferValue) >= totalTradeValueInPrincipal && 
            sub(add(valueToRepayWithFee, bufferValue), totalTradeValueInPrincipal) >= minValueReq) 
        {
            return false;
        }

        return true;
    }

    function _isPositionAboveStopProfit(Order _order, uint[2] _tokenPrices, uint _bufferInPrincipal)
        internal 
        view
        returns (bool)
    {       
        if(_order.trade.stopProfit == 0) {
            return false;
        } else {
            uint principalPerTrade = _tokenPrices[1];
            uint tradeAmount = initialTradeAmount[_order.orderHash];

            uint valueToRepayWithFee = add(add(_order.principalAmount, _order.premium), _order.fee);
            uint totalTradeValueInPrincipal = div(mul(tradeAmount, principalPerTrade), WAD);

            uint stopProfitValue = div(mul(_order.principalAmount, _order.trade.stopProfit), WAD);
            uint bufferValue = div(mul(_order.principalAmount, _bufferInPrincipal), WAD);

            if(totalTradeValueInPrincipal >= add(add(valueToRepayWithFee, stopProfitValue), bufferValue)) {
                return true;
            }

            return false;
        }
    }

    function _generateLiquidateOrderHash
    (
        bytes32 _orderHash
    )
        internal
        view
        returns (bytes32 _liquidateOrderHash)
    {
        return keccak256(
            abi.encodePacked(
                address(this),
                _orderHash,
                "CANCEL_MKERNEL_ORDER"
            )
        );
    }

    function _isOrderValid(Order _order)
        internal
        pure
        returns (bool)
    {
        if(_order.account == address(0) || _order.byUser == address(0)
         || _order.principalToken == address(0) || _order.collateralToken == address(0)
         || _order.trade.closingToken == address(0)
         || _order.trade.tradeToken == address(0)
         || (_order.trade.tradeToken == _order.principalToken) || _order.trade.exchangeConnector == address(0)
         || _order.principalAmount == 0 || _order.collateralAmount == 0
         || _order.premium == 0
         || _order.expirationTimestamp <= _order.createdTimestamp || _order.salt == 0) {
            return false;
        }

        return true;
    }

    function _composeOrder
    (
        address[6] _orderAddresses,
        uint[8] _orderValues
    )
        internal
        view
        returns (Order _order)
    {   
        Trade memory trade = _composeTrade(_orderAddresses[4], _orderAddresses[5], _orderValues[6], _orderValues[7]);

        Order memory order = Order({
            account: _orderAddresses[0],
            byUser: _orderAddresses[1],
            principalToken: _orderAddresses[2],
            collateralToken: _orderAddresses[3],
            principalAmount: _orderValues[0],
            collateralAmount: _orderValues[1],
            premium: _orderValues[2],
            duration: _orderValues[3],
            expirationTimestamp: add(now, _orderValues[3]),
            salt: _orderValues[4],
            fee: _orderValues[5],
            createdTimestamp: now,
            orderHash: bytes32(0),
            trade: trade
        });

        order.orderHash = _generateOrderHash(order);
    
        return order;
    }

    function _composeTrade
    (
        address _tradeToken,
        address _closingToken,
        uint _stopProfit,
        uint _stopLoss
    )
        internal 
        pure
        returns (Trade _trade)
    {
        _trade = Trade({
            tradeToken: _tradeToken,
            closingToken: _closingToken,
            stopProfit: _stopProfit,
            stopLoss: _stopLoss,
            exchangeConnector: address(0)
        });
    }

    function _generateOrderHash(Order _order)
        internal
        view
        returns (bytes32 _orderHash)
    {
        return keccak256(
            abi.encodePacked(
                address(this),
                _generateOrderHash1(_order),
                _generateOrderHash2(_order)
            )
        );
    }

    function _generateOrderHash1(Order _order)
        internal
        view
        returns (bytes32 _orderHash1) 
    {
        return keccak256(
            abi.encodePacked(
                address(this),
                _order.account,
                _order.principalToken,
                _order.collateralToken,
                _order.principalAmount,
                _order.collateralAmount,
                _order.premium,
                _order.duration,
                _order.salt,
                _order.fee
            )
        );
    }

    function _generateOrderHash2(Order _order)
        internal
        view
        returns (bytes32 _orderHash2)
    {
        return keccak256(
            abi.encodePacked(
                address(this),
                _order.trade.tradeToken,
                _order.trade.closingToken,
                _order.trade.stopProfit,
                _order.trade.stopLoss,
                _order.salt
            )
        );
    }

    function getAllOrders()
        public 
        view 
        returns 
        (
            bytes32[]
        )
    {
        return orders;
    }

    
    function getOrder(bytes32 _orderHash)
        public 
        view 
        returns 
        (
            address _account,
            address _byUser,
            address _principalToken,
            address _collateralToken,
            uint _principalAmount,
            uint _collateralAmount,
            uint _premium,
            uint _expirationTimestamp,
            uint _salt,
            uint _fee,
            uint _createdTimestamp
        )
    {   
        Order memory order = hashToOrder[_orderHash];
        return (
            order.account,
            order.byUser,
            order.principalToken,
            order.collateralToken,
            order.principalAmount,
            order.collateralAmount,
            order.premium,
            order.expirationTimestamp,
            order.salt,
            order.fee,
            order.createdTimestamp
        );
    }

    function getTrade(bytes32 _orderHash)
        public 
        view 
        returns 
        (
            address _tradeToken,
            address _closingToken,
            address _initExchangeConnector,
            uint _stopProfit,
            uint _stopLoss
        )
    {   
        Order memory order = hashToOrder[_orderHash];
        return (
            order.trade.tradeToken,
            order.trade.closingToken,
            order.trade.exchangeConnector,
            order.trade.stopProfit,
            order.trade.stopLoss
        );
    }

    function getOrdersForAccount(address _account) 
        public
        view 
        returns 
        (
            bytes32[]
        )
    {
        return accountToOrders[_account];
    }

}