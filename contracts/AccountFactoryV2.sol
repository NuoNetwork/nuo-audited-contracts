pragma solidity 0.4.24;

import "./lib/dappsys/DSThing.sol";
import "./lib/dappsys/DSStop.sol";
import "./lib/utils/Proxy.sol";
import "./Account.sol";
import "./AccountFactory.sol";
import "./Config.sol";
import "./Utils.sol";

/**
 * @author Rohit Soni (rohit@nuofox.com)
 */

contract AccountFactoryV2 is DSStop, Utils {
    Config public config;
    mapping (address => bool) public isAccountValid;
    mapping (address => address[]) public userToAccounts;
    address[] public accounts;

    address public accountMaster;
    AccountFactory public accountFactoryV1;

    constructor
    (
        Config _config, 
        address _accountMaster,
        AccountFactory _accountFactoryV1
    ) 
    public 
    {
        config = _config;
        accountMaster = _accountMaster;
        accountFactoryV1 = _accountFactoryV1;
    }

    event LogAccountCreated(address indexed user, address indexed account, address by);

    modifier onlyAdmin() {
        require(config.isAdminValid(msg.sender), "AccountFactory::_ INVALID_ADMIN_ACCOUNT");
        _;
    }

    function setConfig(Config _config) external note auth addressValid(_config) {
        config = _config;
    }

    function setAccountMaster(address _accountMaster) external note auth addressValid(_accountMaster) {
        accountMaster = _accountMaster;
    }

    function setAccountFactoryV1(AccountFactory _accountFactoryV1) external note auth addressValid(_accountFactoryV1) {
        accountFactoryV1 = _accountFactoryV1;
    }


    function newAccount(address _user)
        public
        note
        addressValid(config)
        addressValid(accountMaster)
        whenNotStopped
        returns 
        (
            Account _account
        ) 
    {
        address proxy = new Proxy(accountMaster);
        _account = Account(proxy);
        _account.init(_user, config);

        accounts.push(_account);
        userToAccounts[_user].push(_account);
        isAccountValid[_account] = true;

        emit LogAccountCreated(_user, _account, msg.sender);
    }
    
    function batchNewAccount(address[] _users) external note onlyAdmin {
        for (uint i = 0; i < _users.length; i++) {
            newAccount(_users[i]);
        }
    }

    function getAllAccounts() public view returns (address[]) {
        uint accLengthV2 = accounts.length; // 1
        uint accLengthV1 = accountFactoryV1.getAllAccounts().length; // 1
        uint accLength = accLengthV2 + accLengthV1; // 2

        address[] memory accs = new address[](accLength);

        for(uint i = 0; i < accLength; i++){
            if(i < accLengthV2) { 
                accs[i] = accounts[i];
            } else {
                accs[i] = accountFactoryV1.accounts(i - accLengthV2);
            }
        }

        return accs;
    }

    function getAccountsForUser(address _user) public view returns (address[]) {
        uint userToAccLengthV2 = userToAccounts[_user].length;
        uint userToAccLengthV1 = accountFactoryV1.getAccountsForUser(_user).length;
        uint userToAccLength = userToAccLengthV2 + userToAccLengthV1;
        
        address[] memory userToAcc = new address[](userToAccLength);

        for(uint i = 0; i < userToAccLength; i++){
            if(i < userToAccLengthV2) {
                userToAcc[i] = userToAccounts[_user][i];
            } else {
                userToAcc[i] = accountFactoryV1.userToAccounts(_user, i - userToAccLengthV2);
            }
        }

        return userToAcc;
    }

    function isAccount(address _account) public view returns (bool) {
        return isAccountValid[_account] || accountFactoryV1.isAccount(_account);
    }

}