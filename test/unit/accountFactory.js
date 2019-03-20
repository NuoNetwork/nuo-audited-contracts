const Account = artifacts.require("Account.sol");
const AccountFactory = artifacts.require("AccountFactory.sol");
const Config = artifacts.require("Config.sol");
const WETH9 = artifacts.require("WETH9.sol");

contract("AccountFactory", (accounts) => {

    const acc0 = accounts[0]; 
    const acc1 = accounts[1]; 

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

});


