pragma solidity 0.4.24;

import "./lib/kyber/KyberNetworkProxy.sol";
import "./lib/dappsys/DSThing.sol";
import "./lib/tokens/ERC20.sol";
import "./Escrow.sol";
import "./Utils.sol";
import "./ExchangeConnector.sol";

/**
 * @author Rohit Soni (rohit@nuofox.com)
 */
 
contract KyberConnector is ExchangeConnector, DSThing, Utils {
    KyberNetworkProxy public kyber;
    address public feeWallet;

    uint constant internal KYBER_MAX_QTY = (10**28);

    constructor(KyberNetworkProxy _kyber, address _feeWallet) public {
        kyber = _kyber;
        feeWallet = _feeWallet;
    }

    function setKyber(KyberNetworkProxy _kyber) 
        public
        auth
        addressValid(_kyber)
    {
        kyber = _kyber;
    }

    function setFeeWallet(address _feeWallet) 
        public 
        note 
        auth
        addressValid(_feeWallet)
    {
        feeWallet = _feeWallet;
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
        return tradeWithOutputFixed(_escrow, _srcToken, _destToken, _srcTokenValue, KYBER_MAX_QTY);
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
        require(_srcToken != _destToken, "KyberConnector::tradeWithOutputFixed TOKEN_ADDRS_SHOULD_NOT_MATCH");

        uint _slippageRate;
        (, _slippageRate) = getExpectedRate(_srcToken, _destToken, _srcTokenValue);

        uint initialSrcTokenBalance = ERC20(_srcToken).balanceOf(this);

        require(ERC20(_srcToken).balanceOf(_escrow) >= _srcTokenValue, "KyberConnector::tradeWithOutputFixed INSUFFICIENT_BALANCE_IN_ESCROW");
        _escrow.transfer(_srcToken, this, _srcTokenValue);

        require(ERC20(_srcToken).approve(kyber, 0), "KyberConnector::tradeWithOutputFixed SRC_APPROVAL_FAILED");
        require(ERC20(_srcToken).approve(kyber, _srcTokenValue), "KyberConnector::tradeWithOutputFixed SRC_APPROVAL_FAILED");
        
        _destTokenValue = kyber.tradeWithHint(
            ERC20(_srcToken),
            _srcTokenValue,
            ERC20(_destToken),
            this,
            _maxDestTokenValue,
            _slippageRate, // no min coversation rate
            feeWallet, 
            new bytes(0)
        );

        _srcTokenValueLeft = sub(ERC20(_srcToken).balanceOf(this), initialSrcTokenBalance);

        require(_transfer(_destToken, _escrow, _destTokenValue), "KyberConnector::tradeWithOutputFixed DEST_TOKEN_TRANSFER_FAILED");
        
        if(_srcTokenValueLeft > 0) {
            require(_transfer(_srcToken, _escrow, _srcTokenValueLeft), "KyberConnector::tradeWithOutputFixed SRC_TOKEN_TRANSFER_FAILED");
        }

        emit LogTrade(_escrow, _srcToken, _destToken, _srcTokenValue, _maxDestTokenValue, _destTokenValue, _srcTokenValueLeft, _slippageRate);
    } 

    function getExpectedRate(address _srcToken, address _destToken, uint _srcTokenValue) 
        public
        view
        returns(uint _expectedRate, uint _slippageRate)
    {
        (_expectedRate, _slippageRate) = kyber.getExpectedRate(ERC20(_srcToken), ERC20(_destToken), _srcTokenValue);
    }

    function isTradeFeasible(address _srcToken, address _destToken, uint _srcTokenValue) 
        public
        view
        returns(bool)
    {
        uint slippageRate; 

        (, slippageRate) = getExpectedRate(
            _srcToken,
            _destToken,
            _srcTokenValue
        );

        return slippageRate != 0;
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