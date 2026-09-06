"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchAccounts,
  fetchBalances,
  fetchCategories,
  fetchCollections,
  fetchEntries,
  fetchPurchases,
  fetchReimbursements,
  type Account,
  type AccountBalance,
  type Category,
  type Collection,
  type Entry,
  type Purchase,
  type Reimbursement,
} from "@/lib/accounting";

export type AccountingData = {
  loading: boolean;
  accounts: Account[];
  balances: AccountBalance[];
  categories: Category[];
  reimbursements: Reimbursement[];
  collections: Collection[];
  purchases: Purchase[];
  entries: Entry[];
  teacherNames: Map<string, string>;
  refresh: () => Promise<void>;
};

export function useAccountingData(): AccountingData {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [teacherNames, setTeacherNames] = useState<Map<string, string>>(
    new Map()
  );

  const refresh = useCallback(async () => {
    const [acc, bal, cat, reimb, coll, purc, ent] = await Promise.all([
      fetchAccounts(),
      fetchBalances(),
      fetchCategories(),
      fetchReimbursements(),
      fetchCollections(),
      fetchPurchases(),
      fetchEntries(),
    ]);
    setAccounts(acc);
    setBalances(bal);
    setCategories(cat);
    setReimbursements(reimb);
    setCollections(coll);
    setPurchases(purc);
    setEntries(ent);

    // 採購清單要顯示「誰要買的」，所有記帳成員都需要姓名對照
    // （teachers 讀取政策已在 purchases_schema.sql 放寬給 can_accounting）
    const { data } = await supabase
      .from("teachers")
      .select("id,name")
      .eq("can_accounting", true);
    setTeacherNames(new Map((data ?? []).map((t) => [t.id, t.name])));
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().finally(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  // 記憶化：不然每次 render 都是新物件，下游的 useMemo / memo 全部失效
  return useMemo(
    () => ({
      loading,
      accounts,
      balances,
      categories,
      reimbursements,
      collections,
      purchases,
      entries,
      teacherNames,
      refresh,
    }),
    [
      loading,
      accounts,
      balances,
      categories,
      reimbursements,
      collections,
      purchases,
      entries,
      teacherNames,
      refresh,
    ]
  );
}
