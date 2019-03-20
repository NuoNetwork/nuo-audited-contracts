pragma solidity 0.4.24;

import "../lib/tokens/ERC20.sol";
import "./MockAccount.sol";

/**
 * @author Rohit Soni (rohit@nuofox.com)
 */

contract MockEscrow {

    function transfer
    (
        address _token,
        address _to,
        uint _value
    )
        public
    {
        ERC20(_token).transfer(_to, _value);
    }

    function transferFromAccount
    (
        address _account,
        address _token,
        address _to,
        uint _value
    )
        public
    {   
        MockAccount(_account).transferBySystem(_token, _to, _value);
    }

}