pragma solidity 0.4.24;

import "./MockEscrow.sol";
import "./MockAccountFactory.sol";

contract MockReserve {

    MockEscrow public escrow;
    MockAccountFactory public accountFactory;


    constructor(MockEscrow _escrow, MockAccountFactory _accountFactory) public {
        escrow = _escrow;
        accountFactory = _accountFactory;
    }

    function release(address _token, address _to, uint _value) 
        public
    {   
        escrow.transfer(_token, _to, _value);
    }

    function lock(address _token, address _from, uint _value, uint _profit, uint _loss)
        public
    {               
        if(accountFactory.isAccount(_from)) {
            escrow.transferFromAccount(_from, _token, address(escrow), _value);
        } else {
            MockEscrow(_from).transfer(_token, address(escrow), _value);
        }
    }

    
    function lockSurplus(address _from, address _forToken, address _token, uint _value) 
        public
    {
        MockEscrow(_from).transfer(_token, address(escrow), _value);
    }

}