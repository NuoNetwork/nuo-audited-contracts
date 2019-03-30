pragma solidity 0.4.24;

/**
 * @author Rohit Soni (rohit@nuofox.com)
 */

contract MockConfig  {

    function isAdminValid(address _admin)
        public
        pure
        returns (bool)
    {
        _admin;
        return true;
    }

}