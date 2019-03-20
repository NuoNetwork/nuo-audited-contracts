pragma solidity 0.4.24;

import "../lib/tokens/ERC20.sol";
import "../ExchangeConnector.sol";
 
contract MockExchangeConnector is ExchangeConnector {

    mapping(bytes32=>uint) public pairRate;
    uint constant PRECISION = 10 ** 18;

    function setPairRate(ERC20 src, ERC20 dest, uint rate) public {
        pairRate[keccak256(src, dest)] = rate;
    }

    function tradeWithInputFixed
    (   
        Escrow _escrow,
        address _srcToken,
        address _destToken,
        uint _srcTokenValue
    )
        public    
        returns (uint _destTokenValue, uint _srcTokenValueLeft)
    {
        uint rate = pairRate[keccak256(_srcToken, _destToken)];
        _destTokenValue = _srcTokenValue * rate / PRECISION;

        _escrow.transfer(_srcToken, this, _srcTokenValue);
        ERC20(_destToken).transfer(_escrow, _destTokenValue);

        _srcTokenValueLeft = 0;
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
        returns (uint _destTokenValue, uint _srcTokenValueLeft)
    {   
        uint rate = pairRate[keccak256(_srcToken, _destToken)];

        uint destAmount = _srcTokenValue * rate / PRECISION;
        uint actualSrcAmount = _srcTokenValue;

        if (destAmount > _maxDestTokenValue) {
            destAmount = _maxDestTokenValue;
            actualSrcAmount = _maxDestTokenValue * PRECISION / rate;
        }

        _escrow.transfer(_srcToken, this, actualSrcAmount);
        ERC20(_destToken).transfer(_escrow, destAmount);

        _destTokenValue = destAmount;
        _srcTokenValueLeft = _srcTokenValue - actualSrcAmount;
    } 

    function getExpectedRate(address _srcToken, address _destToken, uint _srcTokenValue) 
        public
        view
        returns(uint _expectedRate, uint _slippageRate)
    {
        _srcTokenValue;

        _expectedRate = pairRate[keccak256(_srcToken, _destToken)];
        _slippageRate = _expectedRate * 97 / 100;
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

        return slippageRate == 0 ? false : true;
    }

}