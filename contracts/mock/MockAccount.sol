pragma solidity 0.4.24;

import "../lib/tokens/ERC20.sol";


contract MockAccount  {


    function isUser(address _user) public pure returns (bool) {
        _user;
        return true;
    }
    
    function transferBySystem
    (   
        address _token,
        address _to,
        uint _value
    ) 
        external 
    {
        ERC20(_token).transfer(_to, _value);
    }
    
}