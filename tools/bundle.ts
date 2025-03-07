/* eslint-disable */
import Arweave from 'arweave';
import {
  LoggerFactory,
  MemCache,
  RedstoneGatewayContractDefinitionLoader,
  RedstoneGatewayInteractionsLoader,
  SmartWeaveNodeFactory
} from '../src';
import { readJSON } from '../../redstone-smartweave-examples/src/_utils';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
//LoggerFactory.INST.logLevel('error');
LoggerFactory.INST.logLevel('info', 'Contract');
LoggerFactory.INST.logLevel('debug', 'RedstoneGatewayInteractionsLoader');
LoggerFactory.INST.logLevel('error', 'DefaultStateEvaluator');
LoggerFactory.INST.logLevel('error', 'LexicographicalInteractionsSorter');

async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const smartweave = SmartWeaveNodeFactory.memCachedBased(arweave)
    .setInteractionsLoader(
      new RedstoneGatewayInteractionsLoader('https://gateway.redstone.finance/', { notCorrupted: true })
    )
    .setDefinitionLoader(
      new RedstoneGatewayContractDefinitionLoader('https://gateway.redstone.finance', arweave, new MemCache())
    )
    .build();

  const jwk = readJSON('../redstone-node/.secrets/redstone-jwk.json');
  // connecting to a given contract
  const token = smartweave
    .contract("OrO8n453N6bx921wtsEs-0OCImBLCItNU5oSbFKlFuU")
    .setEvaluationOptions({
      sequencerAddress: "https://gateway.redstone.finance/"
    })
    // connecting wallet to a contract. It is required before performing any "writeInteraction"
    // calling "writeInteraction" without connecting to a wallet first will cause a runtime error.
    .connect(jwk);

  const result1 = await token.readState();

  logger.info("Amount of computed interactions before 'bundleInteraction':", Object.keys(result1.validity).length);

  const result = await token.bundleInteraction<any>({
    function: "transfer",
    data: {
      target: "fake-from-bundle",
      qty: 18599333,
    },
  });

  logger.info("Result from the sequencer", result);

  // the new transaction is instantly available - ie. during the state read operation
  const result2 = await token.readState();

  logger.info("Amount of computed interactions after 'bundleInteraction':", Object.keys(result2.validity).length);

}


main().catch((e) => console.error(e));
