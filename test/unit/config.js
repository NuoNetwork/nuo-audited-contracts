const Config = artifacts.require("Config.sol");
const WETH9 = artifacts.require("WETH9.sol");

contract("Config", (accounts) => {

    const acc0 = accounts[0];
    const acc1 = accounts[1]; 

    let weth9;
    let config;

    before( async () => {
        weth9 = await WETH9.new();
        config = await Config.new();
    });
    
    it("should have expected initial states", async () => {
        let disableAdminControl = await config.disableAdminControl();
        assert.isFalse(disableAdminControl);
        assert.isTrue(await config.isAdminValid(acc0));
    });
    
    it("should set weth9", async () => {
        await config.setWETH9(weth9.address);
        assert.equal(await config.weth9() , weth9.address, "invalid weth9 address");
    });

    it("should add/remove account handlers", async () => {
        let isHandler;

        isHandler = await config.isAccountHandler(acc1);
        assert.isFalse(isHandler);

        await config.setAccountHandler(acc1, true);
        isHandler = await config.isAccountHandler(acc1);
        assert.isTrue(isHandler);

        await config.setAccountHandler(acc1, false);
        isHandler = await config.isAccountHandler(acc1);
        assert.isFalse(isHandler);
    });

    it("should add/remove admins", async () => {
        await config.addAdmin(acc1);
        assert.isTrue(await config.isAdminValid(acc1));

        await config.removeAdmin(acc1);
        assert.isFalse(await config.isAdminValid(acc1));
    });

    it("should toggle admins", async () => {
        assert.isFalse(await config.disableAdminControl());
        await config.toggleAdminsControl();
        assert.isTrue(await config.disableAdminControl());
        assert.isTrue(await config.isAdminValid(0));
        await config.toggleAdminsControl();
        assert.isFalse(await config.disableAdminControl());
    });
});