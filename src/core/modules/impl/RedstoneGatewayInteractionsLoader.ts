import {
  Benchmark,
  InteractionsLoader,
  LoggerFactory,
  stripTrailingSlash,
  GQLEdgeInterface,
  GQLNodeInterface
} from '@smartweave';
import 'redstone-isomorphic';
interface Paging {
  total: string;
  limit: number;
  items: number;
  page: number;
  pages: number;
}

interface Interaction {
  status: string;
  confirming_peers: string;
  confirmations: string;
  interaction: GQLNodeInterface;
}

export interface RedstoneGatewayInteractions {
  paging: Paging;
  interactions: Interaction[];
  message?: string;
}

type ConfirmationStatus =
  | {
      notCorrupted?: boolean;
      confirmed?: null;
    }
  | {
      notCorrupted?: null;
      confirmed?: boolean;
    };

export const enum SourceType {
  ARWEAVE = 'arweave',
  REDSTONE_SEQUENCER = 'redstone-sequencer'
}

/**
 * The aim of this implementation of the {@link InteractionsLoader} is to make use of
 * Redstone Gateway ({@link https://github.com/redstone-finance/redstone-sw-gateway})
 * endpoint and retrieve contracts' interactions.
 *
 * Optionally - it is possible to pass:
 * 1. {@link ConfirmationStatus.confirmed} flag - to receive only confirmed interactions - ie. interactions with
 * enough confirmations, whose existence is confirmed by at least 3 Arweave peers.
 * 2. {@link ConfirmationStatus.notCorrupted} flag - to receive both already confirmed and not yet confirmed (ie. latest)
 * interactions.
 * 3. {@link SourceType} - to receive interactions based on their origin ({@link SourceType.ARWEAVE} or {@link SourceType.REDSTONE_SEQUENCER}).
 * If not set, interactions from all sources will be loaded.
 *
 * Passing no flag is the "backwards compatible" mode (ie. it will behave like the original Arweave GQL gateway endpoint).
 * Note that this may result in returning corrupted and/or forked interactions
 * - read more {@link https://github.com/redstone-finance/redstone-sw-gateway#corrupted-transactions}.
 *
 * Please note that currently caching (ie. {@link CacheableContractInteractionsLoader} is switched off
 * for RedstoneGatewayInteractionsLoader due to the issue mentioned in the
 * following comment {@link https://github.com/redstone-finance/redstone-smartcontracts/pull/62#issuecomment-995249264}
 */
export class RedstoneGatewayInteractionsLoader implements InteractionsLoader {
  constructor(
    private readonly baseUrl: string,
    private readonly confirmationStatus: ConfirmationStatus = null,
    private readonly source: SourceType = null
  ) {
    this.baseUrl = stripTrailingSlash(baseUrl);
    Object.assign(this, confirmationStatus);
    this.source = source;
  }

  private readonly logger = LoggerFactory.INST.create('RedstoneGatewayInteractionsLoader');

  async load(contractId: string, fromBlockHeight: number, toBlockHeight: number): Promise<GQLEdgeInterface[]> {
    this.logger.debug('Loading interactions: for ', { contractId, fromBlockHeight, toBlockHeight });

    const interactions: GQLEdgeInterface[] = [];
    let page = 0;
    let totalPages = 0;

    const benchmarkTotalTime = Benchmark.measure();
    do {
      const benchmarkRequestTime = Benchmark.measure();
      const response = await fetch(
        `${this.baseUrl}/gateway/interactions?${new URLSearchParams({
          contractId: contractId,
          from: fromBlockHeight.toString(),
          to: toBlockHeight.toString(),
          page: (++page).toString(),
          ...(this.confirmationStatus && this.confirmationStatus.confirmed ? { confirmationStatus: 'confirmed' } : ''),
          ...(this.confirmationStatus && this.confirmationStatus.notCorrupted
            ? { confirmationStatus: 'not_corrupted' }
            : ''),
          ...(this.source ? { source: this.source } : '')
        })}`
      )
        .then((res) => {
          return res.ok ? res.json() : Promise.reject(res);
        })
        .catch((error) => {
          if (error.body?.message) {
            this.logger.error(error.body.message);
          }
          throw new Error(`Unable to retrieve transactions. Redstone gateway responded with status ${error.status}.`);
        });
      totalPages = response.paging.pages;

      this.logger.debug(
        `Loading interactions: page ${page} of ${totalPages} loaded in ${benchmarkRequestTime.elapsed()}`
      );

      response.interactions.forEach((interaction) =>
        interactions.push({
          cursor: '',
          node: {
            ...interaction.interaction,
            confirmationStatus: interaction.status
          }
        })
      );

      this.logger.debug(`Loaded interactions length: ${interactions.length}`);
    } while (page < totalPages);

    this.logger.debug('All loaded interactions:', {
      from: fromBlockHeight,
      to: toBlockHeight,
      loaded: interactions.length,
      time: benchmarkTotalTime.elapsed()
    });

    return interactions;
  }
}
