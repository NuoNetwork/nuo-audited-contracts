pragma solidity 0.4.24;

import "./lib/tokens/ERC20.sol";
import "./Escrow.sol";

/**
 * @author Rohit Soni (rohit@nuofox.com)
 */
 
interface ExchangeConnector {

    function tradeWithInputFixed
    (   
        Escrow _escrow,
        address _srcToken,
        address _destToken,
        uint _srcTokenValue
    )
        public
        returns (uint _destTokenValue, uint _srcTokenValueLeft);

    function tradeWithOutputFixed
    (   
        Escrow _escrow,
        address _srcToken,
        address _destToken,
        uint _srcTokenValue,
        uint _maxDestTokenValue
    )
        public
        returns (uint _destTokenValue, uint _srcTokenValueLeft);
    

    function getExpectedRate(address _srcToken, address _destToken, uint _srcTokenValue) 
        public
        view
        returns(uint _expectedRate, uint _slippageRate);
    
    function isTradeFeasible(address _srcToken, address _destToken, uint _srcTokenValue) 
        public
        view
        returns(bool);

}