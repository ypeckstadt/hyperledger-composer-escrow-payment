'use strict';

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');
const path = require('path');
const ModelFactory = require('./model-factory');
const Util = require('./util');

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
chai.should();


describe('Buyer accepts merchandise', () => {
    // In-memory card store for testing so cards are not persisted to the file system
    let adminConnection;
    let businessNetworkConnection;
    let adminCardName;

    // Test suite initial setup
    before(async () => {
        // Embedded connection used for local testing
        const connectionProfile = {
            name: 'embedded',
            'x-type': 'embedded'
        };
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // PeerAdmin identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);

        const deployerCardName = 'PeerAdmin';
        adminConnection = new AdminConnection({ cardStore: Util.CARD_STORE });

        // TODO: Quickfix for https://github.com/hyperledger/composer/issues/3023
        if (!global.hasPeerAdminBeenAdded) {
            await adminConnection.importCard(deployerCardName, deployerCard);
            global.hasPeerAdminBeenAdded = true;
        }
       
        await adminConnection.connect(deployerCardName);
    });

    // This is called before each test is executed.
    beforeEach(async () => {
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: Util.CARD_STORE });

        const adminUserName = 'admin';
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));

        // Install the Composer runtime for the new business network
        await adminConnection.install(businessNetworkDefinition);

        // Start the business network and configure an network admin identity
        const startOptions = {
            networkAdmins: [
                {
                    userName: adminUserName,
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(businessNetworkDefinition.getName(), businessNetworkDefinition.getVersion(), startOptions);

        // Import the network admin identity for us to use
        adminCardName = `${adminUserName}@${businessNetworkDefinition.getName()}`;
        await adminConnection.importCard(adminCardName, adminCards.get(adminUserName));

        // Connect to the business network using the network admin identity
        await businessNetworkConnection.connect(adminCardName);

        await Util.createTestTraders(businessNetworkConnection, adminConnection);
    });

    it('the trader is the not the buyer of the trade', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        const trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_4_MERCHANDISE_IS_SHIPPED');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        businessNetworkConnection = await Util.connectAsTrader(2, businessNetworkConnection);

        // accept merchandise
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);

        const accept = ModelFactory.createTransaction(factory, ModelFactory.TYPE.ACCEPT_MERCHANDISE);
        accept.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(accept).should.be.rejectedWith(Error);
    });

    it('the merchandise cannot be accepted', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        const trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_1_WAITING_FOR_TERMS_AGREEMENT');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);

        // accept merchandise
        const accept = ModelFactory.createTransaction(factory, ModelFactory.TYPE.ACCEPT_MERCHANDISE);
        accept.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(accept).should.be.rejectedWith(Error);
    });

    it('the buyer accepts the merchandise but not escrow account is found', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_4_MERCHANDISE_IS_SHIPPED');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);

        // shipping transaction
        const accept = ModelFactory.createTransaction(factory, ModelFactory.TYPE.ACCEPT_MERCHANDISE);
        accept.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(accept).should.be.rejectedWith(Error);
    });

    it('the buyer accepts the merchandise but the escrow account has insufficient funds', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_4_MERCHANDISE_IS_SHIPPED');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // create buyer escrow account
        let account = ModelFactory.createEscrowAccount(factory, '1', buyer.id, 0);
        const accountRegistry = await Util.getEscrowAccountRegistry(businessNetworkConnection);
        await accountRegistry.add(account);

        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);

        // shipping transaction
        const accept = ModelFactory.createTransaction(factory, ModelFactory.TYPE.ACCEPT_MERCHANDISE);
        accept.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(accept).should.be.rejectedWith(Error);
    });

    it('the buyer accepts the merchandise and sellers is paid', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();
        const escrowStartBalance = 20000;

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_4_MERCHANDISE_IS_SHIPPED');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // create buyer escrow account
        let account = ModelFactory.createEscrowAccount(factory, '1', buyer.id, escrowStartBalance);
        const accountRegistry = await Util.getRegistry(businessNetworkConnection, ModelFactory.TYPE.ESCROW_ACCOUNT);
        await accountRegistry.add(account);

        // get seller original balance
        let traderRegistry = await Util.getRegistry(businessNetworkConnection, 'Trader', true);
        seller = await traderRegistry.get(seller.id);
        const sellerStartBalance = seller.balance;

        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);

        // shipping transaction
        const accept = ModelFactory.createTransaction(factory, ModelFactory.TYPE.ACCEPT_MERCHANDISE);
        accept.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(accept);

        // check buyer account balance
        account = await accountRegistry.get('1');
        account.balance.should.equal(escrowStartBalance - trade.total);

        // check seller balance
        traderRegistry = await Util.getRegistry(businessNetworkConnection, 'Trader', true);
        seller = await traderRegistry.get(seller.id);
        seller.balance.should.equal(sellerStartBalance + trade.total);

        // check state of the trade
        trade = await tradeRegistry.get(trade.id);
        trade.status.should.equal('STEP_5_MERCHANDISE_IS_ACCEPTED_AND_SELLER_IS_PAID');
    });
});
