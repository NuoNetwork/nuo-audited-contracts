pragma solidity 0.4.24;

import "./lib/uniswap/UniswapFactory.sol";
import "./lib/uniswap/UniswapExchange.sol";
import "./lib/dappsys/DSThing.sol";
import "./lib/tokens/ERC20.sol";
import "./Escrow.sol";
import "./Utils.sol";
import "./ExchangeConnector.sol";

// TODO: handle liquidation fee, if necessary
/**
 * @author Rohit Soni (rohit@nuofox.com)
 */
 
contract UniswapConnector is ExchangeConnector, DSThing, Utils {
    UniswapFactory public uniswapFactory;

    uint constant internal TOKEN_ALLOWED_SLIPPAGE = 4 * (10**16);
    uint constant internal DEADLINE_DURATION = 2 * 60 * 60; // 2 hr

    constructor(UniswapFactory _uniswapFactory) public {
        uniswapFactory = _uniswapFactory;
    }

    function setUniswapFactory(UniswapFactory _uniswapFactory) 
        public
        auth
        addressValid(_uniswapFactory)
    {
        uniswapFactory = _uniswapFactory;
    }

    event LogTrade
    (
        address indexed _from,
        address indexed _srcToken,
        address indexed _destToken,
        uint _srcTokenValue,
        uint _maxDestTokenValue,
        uint _destTokenValue,
        uint _srcTokenValueLeft, 
        uint _exchangeRate
    );

    
    function tradeWithInputFixed
    (   
        Escrow _escrow,
        address _srcToken,
        address _destToken,
        uint _srcTokenValue
    )
        public    
        note
        auth
        returns (uint _destTokenValue, uint _srcTokenValueLeft)
    {      
        require(_srcToken != _destToken, "UniswapConnector::_validateTradeInputs TOKEN_ADDRS_SHOULD_NOT_MATCH");
        require(_isExchangeAvailable(_srcToken), "UniswapConnector::_validateTradeInputs NO_EXCHNAGE_FOUND_FOR_SOURCE");
        require(_isExchangeAvailable(_destToken), "UniswapConnector::_validateTradeInputs NO_EXCHNAGE_FOUND_FOR_DEST");
        require(ERC20(_srcToken).balanceOf(_escrow) >= _srcTokenValue, "UniswapConnector::_validateTradeInputs INSUFFICIENT_BALANCE_IN_ESCROW");

        uint initialSrcTokenBalance = ERC20(_srcToken).balanceOf(this);
        uint initialDestTokenBalance = ERC20(_destToken).balanceOf(this);
        _escrow.transfer(_srcToken, this, _srcTokenValue);

        address uniswapExchangeAddr = uniswapFactory.getExchange(_srcToken);
        
        ERC20(_srcToken).approve(uniswapExchangeAddr, 0);
        ERC20(_srcToken).approve(uniswapExchangeAddr, _srcTokenValue);
        
        uint exchangeRate = _performTradeWithInputFixed(_srcToken, _destToken, _srcTokenValue);

        _srcTokenValueLeft = sub(ERC20(_srcToken).balanceOf(this), initialSrcTokenBalance);
        _destTokenValue = sub(ERC20(_destToken).balanceOf(this), initialDestTokenBalance);

        _transfer(_destToken, _escrow, _destTokenValue);

        if (_srcTokenValueLeft > 0) {
            _transfer(_srcToken, _escrow, _srcTokenValueLeft);
        }
        
        emit LogTrade(_escrow, _srcToken, _destToken, _srcTokenValue, _destTokenValue, _destTokenValue, _srcTokenValueLeft, exchangeRate);
    }

    function tradeWithOutputFixed
    (   
        Escrow _escrow,
        address _srcToken,
        address _destToken,
        uint _srcTokenValue,
        uint _maxDestTokenValue
    )
        public
        note
        auth
        returns (uint _destTokenValue, uint _srcTokenValueLeft)
    {   

        require(_srcToken != _destToken, "UniswapConnector::_validateTradeInputs TOKEN_ADDRS_SHOULD_NOT_MATCH");
        require(_isExchangeAvailable(_srcToken), "UniswapConnector::_validateTradeInputs NO_EXCHNAGE_FOUND_FOR_SOURCE");
        require(_isExchangeAvailable(_destToken), "UniswapConnector::_validateTradeInputs NO_EXCHNAGE_FOUND_FOR_DEST");
        require(ERC20(_srcToken).balanceOf(_escrow) >= _srcTokenValue, "UniswapConnector::_validateTradeInputs INSUFFICIENT_BALANCE_IN_ESCROW");

        uint initialSrcTokenBalance = ERC20(_srcToken).balanceOf(this);
        uint initialDestTokenBalance = ERC20(_destToken).balanceOf(this);
        _escrow.transfer(_srcToken, this, _srcTokenValue);

        address uniswapExchangeAddr = uniswapFactory.getExchange(_srcToken);

        require(ERC20(_srcToken).approve(uniswapExchangeAddr, 0), "UniswapConnector::tradeWithOutputFixed SRC_APPROVAL_FAILED");
        require(ERC20(_srcToken).approve(uniswapExchangeAddr, _srcTokenValue), "UniswapConnector::tradeWithOutputFixed SRC_APPROVAL_FAILED");

        uint exchangeRate = _performTradeWithOutputFixed(_srcToken, _destToken, _maxDestTokenValue);

        _srcTokenValueLeft = sub(ERC20(_srcToken).balanceOf(this), initialSrcTokenBalance);
        _destTokenValue = sub(ERC20(_destToken).balanceOf(this), initialDestTokenBalance);

        require(_transfer(_destToken, _escrow, _destTokenValue), "UniswapConnector::tradeWithOutputFixed DEST_TOKEN_TRANSFER_FAILED");

        if(_srcTokenValueLeft > 0){
            require(_transfer(_srcToken, _escrow, _srcTokenValueLeft), "UniswapConnector::tradeWithOutputFixed SRC_TOKEN_TRANSFER_FAILED");
        }

        emit LogTrade(_escrow, _srcToken, _destToken, _srcTokenValue, _maxDestTokenValue, _destTokenValue, _srcTokenValueLeft, exchangeRate);
    } 
    
    function getExpectedRate(address _srcToken, address _destToken, uint _srcTokenValue) 
        public
        view
        returns(uint _expectedRate, uint _slippageRate)
    {
        if(address(_srcToken) == address(_destToken)) {
            return (0, 0);
        }

        if(!_isExchangeAvailable(_srcToken) || !_isExchangeAvailable(_destToken)) {
            return (0, 0);
        }

        uint inputValue = _srcTokenValue; 
        uint outputValue; 
        uint exchangeRate;

        (outputValue, exchangeRate) = _calcValuesForTokenToTokenInput(_srcToken, _destToken, inputValue);
        // todo: make slippage 0 if its too low, define a low value
        _expectedRate = exchangeRate;
        _slippageRate = div(mul(exchangeRate, sub(WAD, TOKEN_ALLOWED_SLIPPAGE)), WAD);
    }

    // making trades always feasible and letting tx fail on platform call
    function isTradeFeasible(address _srcToken, address _destToken, uint _srcTokenValue)
        public
        pure
        returns(bool)
    {
        // uint slippageRate; 

        // (, slippageRate) = getExpectedRate(
        //     _srcToken,
        //     _destToken,
        //     _srcTokenValue
        // );

        // return slippageRate == 0 ? false : true;
        _srcToken; 
        _destToken;
        _srcTokenValue;
        return true;
    }
    
    function _isExchangeAvailable(address _token)
        internal
        view
        returns(bool)
    {
        address uniswapExchangeAddr = uniswapFactory.getExchange(_token);
        return (uniswapExchangeAddr != address(0));
    }

    function _performTradeWithInputFixed(
        address _srcToken,
        address _destToken,
        uint _srcTokenValue
    )
        internal
        returns (uint _exchangeRate)
    {
        address uniswapExchangeAddr = uniswapFactory.getExchange(_srcToken);
        UniswapExchange exchange = UniswapExchange(uniswapExchangeAddr);

        uint inputValue = _srcTokenValue;
        uint outputValue;

        (outputValue, _exchangeRate) = _calcValuesForTokenToTokenInput(_srcToken, _destToken, inputValue);
        
        exchange.tokenToTokenSwapInput(
            inputValue,
            div(mul(outputValue, sub(WAD, TOKEN_ALLOWED_SLIPPAGE)), WAD),
            1,
            add(now,DEADLINE_DURATION),
            _destToken
        );

    }

    function _performTradeWithOutputFixed(
        address _srcToken,
        address _destToken,
        uint _maxDestTokenValue
    )
        internal
        returns (uint _exchangeRate)
    {
        address uniswapExchangeAddr = uniswapFactory.getExchange(_srcToken);
        UniswapExchange exchange = UniswapExchange(uniswapExchangeAddr);

        uint outputValue = _maxDestTokenValue;
        uint inputValue; 
        uint inputValueB;
   
        (inputValue, _exchangeRate, inputValueB) = _calcValuesForTokenToTokenOutput(_srcToken, _destToken, outputValue);
        
        exchange.tokenToTokenSwapOutput(
            outputValue,
            div(mul(inputValue, add(WAD, TOKEN_ALLOWED_SLIPPAGE)),WAD),
            div(mul(inputValueB, add(WAD, 20 * (10**16))),WAD),
            add(now,DEADLINE_DURATION),
            _destToken
        );
    }

    function _calcValuesForTokenToTokenOutput
    (
        address _srcToken,
        address _destToken,
        uint _maxDestTokenValue
    )
        internal
        view
        returns
        (
            uint _inputValue,
            uint _exchangeRate,
            uint _inputValueB
        )
    {
        uint inputReserveA;
        uint outputReserveA;
        uint inputReserveB;
        uint outputReserveB;

        (inputReserveA, outputReserveA, inputReserveB, outputReserveB) = _fetchReserveValues(_srcToken, _destToken);

        uint outputValue = _maxDestTokenValue;
        uint outputAmountB = _maxDestTokenValue;
        uint inputAmountB = _calculateEtherTokenInput(outputAmountB, inputReserveB, outputReserveB);

        // redundant variable for readability of the formala
        // inputAmount from the first swap becomes outputAmount of the second swap
        uint outputAmountA = inputAmountB;
        uint inputAmountA = _calculateEtherTokenInput(outputAmountA, inputReserveA, outputReserveA);

        _inputValue = inputAmountA;
        _exchangeRate = div(mul(outputValue, WAD), _inputValue);
        _inputValueB = inputAmountB;
    }
 
    function _calcValuesForTokenToTokenInput
    (
        address _srcToken,
        address _destToken,
        uint _srcTokenValue
    ) 
        internal
        view
        returns
        (
            uint _outputValue,
            uint _exchangeRate
        )
    {   
        uint inputReserveA;
        uint outputReserveA;
        uint inputReserveB;
        uint outputReserveB;

        (inputReserveA, outputReserveA, inputReserveB, outputReserveB) = _fetchReserveValues(_srcToken, _destToken);

        uint inputValue = _srcTokenValue;
        uint inputAmountA = inputValue;

        uint outputAmountA = _calculateEtherTokenOutput(inputAmountA, inputReserveA, outputReserveA);

        // redundant variable for readability of the formala
        // outputAmount from the first swap becomes inputAmount of the second swap
        uint inputAmountB = outputAmountA;
        uint outputAmountB = _calculateEtherTokenOutput(inputAmountB, inputReserveB, outputReserveB);

        _outputValue = outputAmountB;
        _exchangeRate = div(mul(_outputValue, WAD), inputValue);
    }

    function _fetchReserveValues(address _srcToken, address _destToken)
        internal
        view
        returns(
            uint _inputReserveA,
            uint _outputReserveA,
            uint _inputReserveB,
            uint _outputReserveB
        )
    {
        address exchangeAddrA = uniswapFactory.getExchange(_srcToken);
        address exchangeAddrB = uniswapFactory.getExchange(_destToken);

        _inputReserveA = ERC20(_srcToken).balanceOf(exchangeAddrA);
        _outputReserveA = address(exchangeAddrA).balance;

        _inputReserveB = address(exchangeAddrB).balance;
        _outputReserveB = ERC20(_destToken).balanceOf(exchangeAddrB);
    }

    function _calculateEtherTokenOutput(uint _inputAmount, uint _inputReserve, uint _outputReserve) 
        internal
        pure
        returns (uint)
    {
        uint numerator = mul(mul(_inputAmount, _outputReserve), 997);
        uint denominator = add(mul(_inputReserve,1000), mul(_inputAmount, 997));

        return div(numerator, denominator);
    }

    function _calculateEtherTokenInput(uint _outputAmount, uint _inputReserve, uint _outputReserve)
        internal
        pure
        returns (uint)
    {
        uint numerator = mul(mul(_outputAmount, _inputReserve), 1000);
        uint denominator = mul(sub(_outputReserve, _outputAmount), 997);

        return add(div(numerator, denominator), 1);
    }

    function _transfer
    (
        address _token,
        address _to,
        uint _value
    )
        internal
        returns (bool)
    {
        return ERC20(_token).transfer(_to, _value);
    }
}