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


describe('Trader starts trade', () => {
    // In-memory card store for testing so cards are not persisted to the file system
    let adminConnection;
    let businessNetworkConnection;

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
        let adminCardName;
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

    it('a trade cannot be started without items', async () => {
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        // Submit start trade request
        let trader = Util.getTrader(1);
        const startTrade = ModelFactory.createTransaction(factory, ModelFactory.TYPE.START_TRADE);
        startTrade.trader =  ModelFactory.createRelationshipForTrader(factory, trader.id);
        startTrade.items = [];
        startTrade.isEscrowPayment = false;
        await businessNetworkConnection.submitTransaction(startTrade).should.be.rejectedWith(Error);
    });

    it('buyer has insufficient funds', async () => {
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        // Create items
        const itemRegistry = await Util.getItemRegistry(businessNetworkConnection);
        await itemRegistry.addAll([
            ModelFactory.createItem(factory, '1', 'item one', 100.00),
            ModelFactory.createItem(factory, '2', 'item two', 200.00)
        ]);

        // Submit start trade request
        let trader = Util.getTrader(1);
        const startTrade = ModelFactory.createTransaction(factory, ModelFactory.TYPE.START_TRADE);
        startTrade.trader = ModelFactory.createRelationshipForTrader(factory, trader.id);
        startTrade.items = [
            ModelFactory.createRelationshipForItem(factory, '1'),
            ModelFactory.createRelationshipForItem(factory, '2')
        ];
        startTrade.isEscrowPayment = false;
        await businessNetworkConnection.submitTransaction(startTrade).should.be.rejectedWith(Error);
    });

    it('seller cannot start a direct payment', async () => {
        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        // Create items
        const itemRegistry = await Util.getItemRegistry(businessNetworkConnection);
        await itemRegistry.addAll([
            ModelFactory.createItem(factory, '1', 'item one', 100.00),
            ModelFactory.createItem(factory, '2', 'item two', 200.00)
        ]);

        // Submit start trade request
        let trader = Util.getTrader(0);
        const startTrade = ModelFactory.createTransaction(factory, ModelFactory.TYPE.START_TRADE);
        startTrade.trader = ModelFactory.createRelationshipForTrader(factory, trader.id);
        startTrade.isStartedBySeller = true;
        startTrade.items = [
            ModelFactory.createRelationshipForItem(factory, '1'),
            ModelFactory.createRelationshipForItem(factory, '2')
        ];
        startTrade.isEscrowPayment = false;
        await businessNetworkConnection.submitTransaction(startTrade).should.be.rejectedWith(Error);
    });

    it('buyer has sufficient funds for direct payment', async () => {
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();
        const startBalance = 20000;

        // Create items
        const itemRegistry = await Util.getItemRegistry(businessNetworkConnection);
        await itemRegistry.addAll([
            ModelFactory.createItem(factory, '1', 'item one', 100.00),
            ModelFactory.createItem(factory, '2', 'item two', 200.00)
        ]);

        // Update buyer balance
        let buyer = Util.getTrader(0);
        const traderRegistry = await Util.getTraderRegistry(businessNetworkConnection);
        let trader = await traderRegistry.get(buyer.id);
        trader.balance = startBalance;
        await traderRegistry.update(trader);

        // get seller current balance
        let seller = Util.getTrader(1);
        trader = await traderRegistry.get(seller.id);
        const sellerStartBalance = trader.balance;


        // Submit start trade request
        const startTrade = ModelFactory.createTransaction(factory, ModelFactory.TYPE.START_TRADE);
        startTrade.trader = ModelFactory.createRelationshipForTrader(factory, seller.id);
        startTrade.items = [
            ModelFactory.createRelationshipForItem(factory, '1'),
            ModelFactory.createRelationshipForItem(factory, '2')
        ];
        startTrade.isEscrowPayment = false;
        await businessNetworkConnection.submitTransaction(startTrade);

        // check balance of buyer
        trader = await traderRegistry.get(buyer.id);
        trader.balance.should.equal(startBalance - 200.00 - 100.00);

        // check balance of seller
        trader = await traderRegistry.get(seller.id);
        trader.balance.should.equal(sellerStartBalance + 200.00 + 100.00);

        // check trade log
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        const trades =  await tradeRegistry.getAll();
        trades.length.should.equal(1);
        const trade = trades[0];
        trade.isEscrowPayment.should.equal(false);
        trade.status.should.equal('STEP_1_DIRECT_PAYMENT_COMPLETED');
    });

    it('buyer starts valid escrow payment', async () => {
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();
        const startBalance = 20000;

        // Create items
        const itemRegistry = await Util.getItemRegistry(businessNetworkConnection);
        await itemRegistry.addAll([
            ModelFactory.createItem(factory, '1', 'item one', 100.00),
            ModelFactory.createItem(factory, '2', 'item two', 200.00)
        ]);

        // Update buyer balance
        let buyer = Util.getTrader(0);
        const traderRegistry = await Util.getTraderRegistry(businessNetworkConnection);
        let trader = await traderRegistry.get(buyer.id);
        trader.balance = startBalance;
        await traderRegistry.update(trader);


        // Submit start trade request
        let seller = Util.getTrader(1);
        const startTrade = ModelFactory.createTransaction(factory, ModelFactory.TYPE.START_TRADE);
        startTrade.trader = ModelFactory.createRelationshipForTrader(factory, seller.id);
        startTrade.items = [
            ModelFactory.createRelationshipForItem(factory, '1'),
            ModelFactory.createRelationshipForItem(factory, '2')
        ];
        startTrade.isEscrowPayment = true;
        await businessNetworkConnection.submitTransaction(startTrade);

        // check trade log
        const tradeRegistry =  await Util.getTradeRegistry(businessNetworkConnection);
        const trades =  await tradeRegistry.getAll();
        trades.length.should.equal(1);
        const trade = trades[0];
        trade.isEscrowPayment.should.equal(false);
        trade.status.should.equal('STEP_1_WAITING_FOR_TERMS_AGREEMENT');
    });

    it('seller starts valid escrow payment', async () => {
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();
        const startBalance = 20000;

        // Create items
        const itemRegistry = await Util.getItemRegistry(businessNetworkConnection);
        await itemRegistry.addAll([
            ModelFactory.createItem(factory, '1', 'item one', 100.00),
            ModelFactory.createItem(factory, '2', 'item two', 200.00)
        ]);

        // Update buyer balance
        let buyer = Util.getTrader(0);
        const traderRegistry = await Util.getTraderRegistry(businessNetworkConnection);
        let trader = await traderRegistry.get(buyer.id);
        trader.balance = startBalance;
        await traderRegistry.update(trader);

        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);

        // Submit start trade request
        const startTrade = ModelFactory.createTransaction(factory, ModelFactory.TYPE.START_TRADE);
        startTrade.trader = ModelFactory.createRelationshipForTrader(factory, buyer.id);
        startTrade.items = [
            ModelFactory.createRelationshipForItem(factory, '1'),
            ModelFactory.createRelationshipForItem(factory, '2')
        ];
        startTrade.isEscrowPayment = true;
        startTrade.isStartedBySeller = true;
        await businessNetworkConnection.submitTransaction(startTrade);

        // check trade log
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        const trades =  await tradeRegistry.getAll();
        trades.length.should.equal(1);
        const trade = trades[0];
        trade.isEscrowPayment.should.equal(false);
        trade.status.should.equal('STEP_1_WAITING_FOR_TERMS_AGREEMENT');
    });

    it('sellers escrow payment is refused because buyer has insufficient funds', async () => {
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();
        const startBalance = 20000;

        // Create items
        const itemRegistry = await Util.getItemRegistry(businessNetworkConnection);
        await itemRegistry.addAll([
            ModelFactory.createItem(factory, '1', 'item one', 100.00),
            ModelFactory.createItem(factory, '2', 'item two', 200.00)
        ]);

        // Update buyer balance
        let buyer = Util.getTrader(0);
        const traderRegistry = await Util.getTraderRegistry(businessNetworkConnection);
        let trader = await traderRegistry.get(buyer.id);
        trader.balance = startBalance;
        await traderRegistry.update(trader);


        // Submit start trade request
        let seller = Util.getTrader(1);
        const startTrade = ModelFactory.createTransaction(factory, ModelFactory.TYPE.START_TRADE);
        startTrade.trader = ModelFactory.createRelationshipForTrader(factory, seller.id);
        startTrade.items = [
            ModelFactory.createRelationshipForItem(factory, '1'),
            ModelFactory.createRelationshipForItem(factory, '2')
        ];
        startTrade.isEscrowPayment = true;
        startTrade.isStartedBySeller = true;
        await businessNetworkConnection.submitTransaction(startTrade).should.be.rejectedWith(Error);
    });

    it('buyers escrow payment is refused because buyer has insufficient funds', async () => {
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        // Create items
        const itemRegistry = await Util.getItemRegistry(businessNetworkConnection);
        await itemRegistry.addAll([
            ModelFactory.createItem(factory, '1', 'item one', 100.00),
            ModelFactory.createItem(factory, '2', 'item two', 200.00)
        ]);


        // Submit start trade request
        let seller = Util.getTrader(1);
        const startTrade = ModelFactory.createTransaction(factory, ModelFactory.TYPE.START_TRADE);
        startTrade.trader = ModelFactory.createRelationshipForTrader(factory, seller.id);
        startTrade.items = [
            ModelFactory.createRelationshipForItem(factory, '1'),
            ModelFactory.createRelationshipForItem(factory, '2')
        ];
        startTrade.isEscrowPayment = true;
        await businessNetworkConnection.submitTransaction(startTrade).should.be.rejectedWith(Error);
    });
});