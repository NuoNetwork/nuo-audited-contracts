const helpers = require("./helpers.js");
const TestToken = artifacts.require("TestToken.sol");
const Config = artifacts.require("Config.sol");
const WETH9 = artifacts.require("WETH9.sol");
const Account = artifacts.require("Account.sol");

const signTypeMeta = {
    transferByUser : ['address', 'address', 'address', 'uint256', 'uint256'],
    addUser: ['address', 'address', 'string', 'uint256'],
    removeUser: ['address', 'address', 'string', 'uint256']
};

contract("Account", (accounts) => {

    const acc0 = accounts[0]; // relayer
    const acc1 = accounts[1]; // user 1
    const acc2 = accounts[2]; // user 2 / handler

    let weth9;
    let config;
    let account;
    let testToken;

    before(async () => {
        weth9 = await WETH9.new();
        config = await Config.new();
        await config.setWETH9(weth9.address);
        account = await Account.new();
        await account.init(acc1, config.address);
        
        testToken = await TestToken.new();
    });
    
    it("should have expected initial states", async () => {
        assert.isTrue(await account.isUser(acc1));
        assert.isTrue(await account.isInitialized());
        assert.equal(await account.weth9(), weth9.address, "invalid weth9 addr");
        assert.equal(await account.config(), config.address, "invalid config addr");
        assert.equal((await account.getAllUsers()).length, 1, "unknown user list states");
    });
    
    it("should receive eth and convert to weth", async () => {
        let value = web3.toWei(0.1, "ether");

        let initBal = await weth9.balanceOf(account.address);
        await helpers.sendEther(acc0, account.address, value);
        let finalBal = await weth9.balanceOf(account.address);

        let diffBal = finalBal.minus(initBal);
        assert.isTrue(diffBal.eq(value), "invalid weth9 value in account");
    });

    it("should receive and withdraw eth", async () => {
        let value = web3.toWei(0.1, "ether");
        let initBal = await helpers.getEtherBalance(acc1);
        let salt = helpers.generateRandomNumber();
        await helpers.sendEther(acc0, account.address, value);
        
        let data = [account.address, weth9.address, acc1, value, salt];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["transferByUser"], data);

        data.shift();
        data.push(result.sign);

        await account.transferByUser(...data);
        let finalBal = await helpers.getEtherBalance(acc1);
        let diffBal = finalBal.minus(initBal);

        assert.isTrue(diffBal.eq(value), "invalid ether value in wallet");
    });


    it("should receive and withdraw erc20 tokens", async () => {
        let value = web3.toWei(0.1, "ether");

        let initRecBal = await testToken.balanceOf(account.address);
        await testToken.transfer(account.address, value);
        let finalRecBal = await testToken.balanceOf(account.address);

        assert.isTrue((finalRecBal.minus(initRecBal)).eq(value), "erc20 token receive failed");

        let initWithdrawBal = await testToken.balanceOf(acc1); 


        let salt = helpers.generateRandomNumber();
        
        let data = [account.address, testToken.address, acc1, value, salt];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["transferByUser"], data);

        data.shift();
        data.push(result.sign);

        await account.transferByUser(...data);

        let finalWithdrawBal = await testToken.balanceOf(acc1);
        let diffWithdrawBal = finalWithdrawBal.minus(initWithdrawBal);

        assert.isTrue(diffWithdrawBal.eq(value), "erc20 token withdraw failed");
    });
   
    it("should add/remove addtional users", async () => {

        // add user
        assert.isFalse(await account.isUser(acc2), "unknown init state");

        let salt = helpers.generateRandomNumber();
        let data = [account.address, acc2, "ADD_USER", salt];
        

        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["addUser"], data);

        data = data.filter(function(value){
            return value != "ADD_USER";
        });

        data.shift();
        data.push(result.sign);

        await account.addUser(...data);

        assert.isTrue(await account.isUser(acc2), "user addition failed");

        // remove user
        salt = helpers.generateRandomNumber();
        data = [account.address, acc2, "REMOVE_USER", salt];

        result = await helpers.generateAndSignHash(acc1, signTypeMeta["removeUser"], data);

        data = data.filter(function(value){
            return value != "REMOVE_USER";
        });

        data.shift();
        data.push(result.sign);

        await account.removeUser(...data);

        assert.isFalse(await account.isUser(acc2), "user removal failed");

    });

    it("should allow erc20 transfer by handlers", async () => {

        await config.setAccountHandler(acc2, true); // setting handler

        let value = web3.toWei(0.1, "ether");

        await testToken.transfer(account.address, value);

        let initBal = await testToken.balanceOf(acc2);
        
        await account.transferBySystem(
            testToken.address,
            acc2,
            value,
            {from:acc2}
        );

        let finalBal = await testToken.balanceOf(acc2);
        let diffBal = finalBal.minus(initBal);

        assert.isTrue(diffBal.eq(value), "erc20 transfer by handler failed");
    });
});


