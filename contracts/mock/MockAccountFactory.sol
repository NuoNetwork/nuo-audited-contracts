pragma solidity 0.4.24;

contract MockAccountFactory {

    bool public isAccountValid = true;

    function isAccount(address _account) public view returns (bool) 
    {
        return isAccountValid;
    }

    function setAccountValidity(bool _flag) public {
        isAccountValid = _flag;
    }

    function useDefaults() public {
        isAccountValid = true;
    }

}