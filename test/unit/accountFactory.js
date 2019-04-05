const helpers = require("./helpers.js");
const Account = artifacts.require("Account.sol");
const Account2 = artifacts.require("Account.sol");
const AccountFactory = artifacts.require("AccountFactory.sol");
const Config = artifacts.require("Config.sol");
const WETH9 = artifacts.require("WETH9.sol");
const Proxy1 = artifacts.require("Proxy.sol");

const signTypeMeta = {
    changeImpl: ['address', 'address', 'string', 'uint256']    
};


contract("AccountFactory", (accounts) => {

    const acc0 = accounts[0]; 
    const acc1 = accounts[1]; 
    const acc2 = accounts[2]; 

    let weth9;
    let config;
    let account;
    let accountFactory;

    before(async () => {
        weth9 = await WETH9.new();
        config = await Config.new();
        await config.setWETH9(weth9.address);
        account = await Account.new();
        await account.init(acc0, config.address);
        accountFactory = await AccountFactory.new(config.address, account.address);

        account2 = await Account2.new(); // to check for change in reference implementation
    });
    
    it("should have expected initial states", async () => {
        assert.equal(await accountFactory.config(), config.address, "invalid config addr");
        assert.equal(await accountFactory.accountMaster(), account.address, "invalid account master");
    });

    it("should create new account for user", async () => {
        await accountFactory.newAccount(acc1);

        let newAccountList = await accountFactory.getAllAccounts();
        let newAccount = Account.at(await accountFactory.accounts(0));

        assert.isTrue(await accountFactory.isAccount(newAccount.address), "new account not present in factory");
        assert.equal(newAccountList.length, 1, "invalid number of accounts created");

        assert.isTrue(await newAccount.isInitialized());
        assert.equal(await newAccount.weth9(), weth9.address, "invalid weth9 addr for new account");
        assert.equal(await newAccount.config(), config.address, "invalid config addr for new account");
    });

    it("should create batch create new accounts for users", async () => {
        let tx = await accountFactory.batchNewAccount([acc0, acc1]);
        let newAcc0 = Account.at(tx.logs[0].args.account);
        let newAcc1 = Account.at(tx.logs[1].args.account);
        
        assert.isTrue(await accountFactory.isAccount(newAcc0.address), "new account not present in factory");
        assert.isTrue(await accountFactory.isAccount(newAcc1.address), "new account not present in factory");

        assert.equal(tx.logs.length, 2, "invalid number of accounts created")
        assert.isTrue(await newAcc0.isUser(acc0), "invalid batch accounts created for acc0");
        assert.isTrue(await newAcc1.isUser(acc1), "invalid batch accounts created for acc1");
    });

    it("should change reference impl for new account for user", async () => {
        let tx = await accountFactory.newAccount(acc1);
        let newAcc = Account.at(tx.logs[0].args.account);
        let proxy = Proxy1.at(newAcc.address);

        assert.equal(await proxy.implementation(), account.address, "invalid account reference impl");

        let salt = helpers.generateRandomNumber();
        let data = [newAcc.address, account2.address, "CHANGE_ACCOUNT_IMPLEMENTATION", salt];
        

        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["changeImpl"], data);

        data = data.filter(function(value){
            return value != "CHANGE_ACCOUNT_IMPLEMENTATION";
        });

        data.shift();
        data.push(result.sign);

        await newAcc.changeImpl(...data);

        assert.equal(await proxy.implementation(), account2.address, "invalid account reference impl change");
    });

    it("should have accounts details for user", async () => {
        let tx = await accountFactory.newAccount(acc2);
        let newAcc0 = Account.at(tx.logs[0].args.account);

        assert.isTrue(await accountFactory.isAccount(newAcc0.address), "new account not present in factory V2");

        let accountsForUser = await accountFactory.getAccountsForUser(acc2);
        assert.equal(accountsForUser[0], newAcc0.address);
    });
});


