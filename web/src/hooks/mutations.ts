import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useRef } from 'react';
import { api, idempotencyKey, type Activity, type Pool } from '@/lib/api';
import { queryKeys } from './queries';

/** Everything a successful money movement invalidates. */
function walletKeys() {
  return [[...queryKeys.accounts], ['activity'], [...queryKeys.status], ['blocks']];
}

function useInvalidateWallet() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      walletKeys().map((key) =>
        queryClient.invalidateQueries({ queryKey: key, refetchType: 'active' }),
      ),
    );
  };
}

function useOperationKey<T>(fingerprint: (variables: T) => string) {
  const operation = useRef<{ fingerprint: string; key: string }>(undefined);
  return {
    keyFor(variables: T) {
      const next = fingerprint(variables);
      if (operation.current?.fingerprint !== next) {
        operation.current = { fingerprint: next, key: idempotencyKey() };
      }
      return operation.current.key;
    },
    clear() {
      operation.current = undefined;
    },
  };
}

export interface SendVariables {
  from_account: number;
  to_account: number;
  source_pool: Pool;
  destination_pool: Pool;
  amount_zatoshi: bigint;
}

export function useSend(): UseMutationResult<Activity, Error, SendVariables> {
  const invalidate = useInvalidateWallet();
  const operation = useOperationKey(
    (variables: SendVariables) =>
      `${variables.from_account}:${variables.to_account}:${variables.source_pool}:${variables.destination_pool}:${variables.amount_zatoshi}`,
  );
  return useMutation({
    mutationFn: (variables: SendVariables) =>
      api.send({ ...variables, idempotency_key: operation.keyFor(variables) }),
    onSuccess: async () => {
      operation.clear();
      await invalidate();
    },
  });
}

export interface FaucetVariables {
  account_id: number;
  pool: Pool;
  amount_zatoshi: bigint;
}

export function useFaucet(): UseMutationResult<Activity, Error, FaucetVariables> {
  const invalidate = useInvalidateWallet();
  const operation = useOperationKey(
    (variables: FaucetVariables) =>
      `${variables.account_id}:${variables.pool}:${variables.amount_zatoshi}`,
  );
  return useMutation({
    mutationFn: (variables: FaucetVariables) =>
      api.faucet({ ...variables, idempotency_key: operation.keyFor(variables) }),
    onSuccess: async () => {
      operation.clear();
      await invalidate();
    },
  });
}

export function useMine(): UseMutationResult<{ blocks: number }, Error, number> {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (blocks: number) => api.mine(blocks),
    onSuccess: invalidate,
  });
}
