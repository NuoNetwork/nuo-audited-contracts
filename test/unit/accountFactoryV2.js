const Account = artifacts.require("Account.sol");
const AccountFactory = artifacts.require("AccountFactory.sol");
const AccountFactoryV2 = artifacts.require("AccountFactoryV2.sol");
const Config = artifacts.require("Config.sol");
const WETH9 = artifacts.require("WETH9.sol");


const signTypeMeta = {
    changeImpl: ['address', 'address', 'string', 'uint256']    
};


contract("AccountFactoryV2", (accounts) => {

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
        accountFactoryV2 = await AccountFactoryV2.new(config.address, account.address, accountFactory.address);
    });
    
    it("should have expected initial states", async () => {
        assert.equal(await accountFactoryV2.config(), config.address, "invalid config addr");
        assert.equal(await accountFactoryV2.accountMaster(), account.address, "invalid account master");
        assert.equal(await accountFactoryV2.accountFactoryV1(), accountFactory.address, "invalid account factory v1");
    });

    it("should create new account for user", async () => {
        await accountFactoryV2.newAccount(acc1);

        let newAccountList = await accountFactoryV2.getAllAccounts();
        let newAccount = Account.at(await accountFactoryV2.accounts(0));

        assert.isTrue(await accountFactoryV2.isAccount(newAccount.address), "new account not present in factory");
        assert.equal(newAccountList.length, 1, "invalid number of accounts created");

        assert.isTrue(await newAccount.isInitialized());
        assert.equal(await newAccount.weth9(), weth9.address, "invalid weth9 addr for new account");
        assert.equal(await newAccount.config(), config.address, "invalid config addr for new account");
    });

    it("should create batch create new accounts for users", async () => {
        let tx = await accountFactoryV2.batchNewAccount([acc0, acc1]);
        let newAcc0 = Account.at(tx.logs[0].args.account);
        let newAcc1 = Account.at(tx.logs[1].args.account);
        
        assert.isTrue(await accountFactoryV2.isAccount(newAcc0.address), "new account not present in factory");
        assert.isTrue(await accountFactoryV2.isAccount(newAcc1.address), "new account not present in factory");

        assert.equal(tx.logs.length, 2, "invalid number of accounts created")
        assert.isTrue(await newAcc0.isUser(acc0), "invalid batch accounts created for acc0");
        assert.isTrue(await newAcc1.isUser(acc1), "invalid batch accounts created for acc1");
    });

    it("should refer accounts in account factory v1", async () => {
        let tx = await accountFactory.newAccount(acc1);
        let newAcc0 = Account.at(tx.logs[0].args.account);
        
        assert.isTrue(await accountFactoryV2.isAccount(newAcc0.address), "new account not present in factory V2");
    });

    it("should refer accounts in account factory v1 and v2", async () => {
        let tx = await accountFactory.newAccount(acc2);
        let newAcc0 = Account.at(tx.logs[0].args.account);

        tx = await accountFactoryV2.newAccount(acc2);
        let newAcc1 = Account.at(tx.logs[0].args.account);
        
        
        assert.isTrue(await accountFactoryV2.isAccount(newAcc0.address), "new account not present in factory V2");
        assert.isTrue(await accountFactoryV2.isAccount(newAcc1.address), "new account not present in factory V2");

        let accountsForUser = await accountFactoryV2.getAccountsForUser(acc2);
        assert.equal(accountsForUser[1], newAcc0.address);
        assert.equal(accountsForUser[0], newAcc1.address);
    });
});


