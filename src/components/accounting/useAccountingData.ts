"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchAccounts,
  fetchBalances,
  fetchCategories,
  fetchCollections,
  fetchEntries,
  fetchReimbursements,
  type Account,
  type AccountBalance,
  type Category,
  type Collection,
  type Entry,
  type Reimbursement,
} from "@/lib/accounting";

export type AccountingData = {
  loading: boolean;
  accounts: Account[];
  balances: AccountBalance[];
  categories: Category[];
  reimbursements: Reimbursement[];
  collections: Collection[];
  entries: Entry[];
  teacherNames: Map<string, string>;
  refresh: () => Promise<void>;
};

export function useAccountingData(isAdmin: boolean): AccountingData {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [teacherNames, setTeacherNames] = useState<Map<string, string>>(
    new Map()
  );

  const refresh = useCallback(async () => {
    const [acc, bal, cat, reimb, coll, ent] = await Promise.all([
      fetchAccounts(),
      fetchBalances(),
      fetchCategories(),
      fetchReimbursements(),
      fetchCollections(),
      fetchEntries(),
    ]);
    setAccounts(acc);
    setBalances(bal);
    setCategories(cat);
    setReimbursements(reimb);
    setCollections(coll);
    setEntries(ent);

    // 管理者才讀得到全部老師姓名（RLS 限制），負責人只看自己的紀錄故不需要
    if (isAdmin) {
      const { data } = await supabase
        .from("teachers")
        .select("id,name")
        .eq("can_accounting", true);
      setTeacherNames(new Map((data ?? []).map((t) => [t.id, t.name])));
    }
    setLoading(false);
  }, [isAdmin]);

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

  return {
    loading,
    accounts,
    balances,
    categories,
    reimbursements,
    collections,
    entries,
    teacherNames,
    refresh,
  };
}
