import { TokenAmount, Pair, Currency, JSBI, Token } from '@jediswap/sdk'
import { useMemo } from 'react'
import JediswapPairABI from '../constants/abis/Pair.json'
import { Interface } from '@ethersproject/abi'
import { useActiveStarknetReact } from '../hooks'

import { wrappedCurrency } from '../utils/wrappedCurrency'
import { Abi, Args, RawArgs, uint256 } from 'starknet'
import { usePairAddresses } from '../hooks/usePairAddress'
import { NEVER_RELOAD, useMultipleContractSingleData, useSingleContractMultipleData } from '../state/multicall/hooks'
import { useRegistryContract } from '../hooks/useContract'

export enum PairState {
  LOADING,
  NOT_EXISTS,
  EXISTS,
  INVALID
}

export interface LiquidityPairToken {
  liquidityToken: Token | undefined
  tokens: [Token, Token]
}

export function usePairs(currencies: [Currency | undefined, Currency | undefined][]): [PairState, Pair | null][] {
  const { chainId } = useActiveStarknetReact()

  const tokens = useMemo(
    () =>
      currencies.map(([currencyA, currencyB]) => [
        wrappedCurrency(currencyA, chainId),
        wrappedCurrency(currencyB, chainId)
      ]),
    [chainId, currencies]
  )

  // const pairAddresses = usePairAddresses(tokens)

  const callInputs: (RawArgs | undefined)[] = tokens.map(([tokenA, tokenB]) =>
    tokenA && tokenB && !tokenA.equals(tokenB) ? { token0: tokenA?.address, token1: tokenB?.address } : undefined
  )
  //

  const registryContract = useRegistryContract(true)

  const pairAddressesCallState = useSingleContractMultipleData(
    registryContract,
    'get_pair_for',
    callInputs,
    NEVER_RELOAD
  )

  const pairAddresses = pairAddressesCallState.map(pairAddress => pairAddress.result?.[0])
  // console.log('🚀 ~ file: Reserves.ts ~ line 50 ~ usePairs ~ pairAddresses', pairAddresses)

  // const pairAddresses = useMemo(
  //   () =>
  //     tokens.map(([tokenA, tokenB]) => {
  //       return tokenA && tokenB && !tokenA.equals(tokenB) ? Pair.getAddress(tokenA, tokenB) : undefined
  //     }),
  //   [tokens]
  // )

  const results = useMultipleContractSingleData(pairAddresses, JediswapPairABI as Abi, 'get_reserves')
  // console.log('🚀 ~ file: Reserves.ts ~ line 60 ~ usePairs ~ results', results)

  return useMemo(() => {
    return results.map((result, i) => {
      const { result: reserves, loading } = result
      const tokenA = tokens?.[i]?.[0]
      const tokenB = tokens?.[i]?.[1]

      if (loading) return [PairState.LOADING, null]
      if (!tokenA || !tokenB || tokenA.equals(tokenB)) return [PairState.INVALID, null]
      if (!reserves) return [PairState.NOT_EXISTS, null]
      const { reserve0, reserve1 } = reserves

      const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]

      // const reserve0Amount = JSBI.BigInt(uint256.uint256ToBN(reserve0 as any).toString())
      // const reserve1Amount = JSBI.BigInt(uint256.uint256ToBN(reserve1 as any).toString())

      return [
        PairState.EXISTS,
        new Pair(
          new TokenAmount(token0, reserve0.toString()),
          new TokenAmount(token1, reserve1.toString()),
          pairAddresses[i]
        )
      ]
    })
  }, [pairAddresses, results, tokens])
}

export function usePair(tokenA?: Currency, tokenB?: Currency): [PairState, Pair | null] {
  const pairs = usePairs([[tokenA, tokenB]])?.[0]
  // console.log('🚀 ~ file: Reserves.ts ~ line 93 ~ usePair ~ pairs', pairs)
  return pairs ?? [PairState.LOADING, null]
}

export function useTokenPairsWithLiquidityTokens(pairTokens: [Token, Token][]): [LiquidityPairToken[], boolean] {
  const registryContract = useRegistryContract(true)

  const callInputs: (RawArgs | undefined)[] = pairTokens.map(([tokenA, tokenB]) =>
    tokenA && tokenB && !tokenA.equals(tokenB) ? { token0: tokenA?.address, token1: tokenB?.address } : undefined
  )

  const pairAddressesCallState = useSingleContractMultipleData(
    registryContract,
    'get_pair_for',
    callInputs,
    NEVER_RELOAD
  )

  const pairAddresses = pairAddressesCallState.map(pairAddress => pairAddress.result?.[0])

  const anyLoading = pairAddressesCallState.some(pairAddresses => pairAddresses.loading)

  return [
    useMemo(
      () =>
        pairTokens.map(([tokenA, tokenB], i) => {
          const pairAddress = pairAddresses?.[i]

          if (!pairAddress) return { liquidityToken: undefined, tokens: [tokenA, tokenB] }

          return {
            liquidityToken: new Token(tokenA.chainId, pairAddress, 18, 'MGP', 'Mesh Generic Pair'),
            tokens: [tokenA, tokenB]
          }
        }),
      [pairAddresses, pairTokens]
    ),
    anyLoading
  ]
}
