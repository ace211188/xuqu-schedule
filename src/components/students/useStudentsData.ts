"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchStudents,
  fetchFeeRecords,
  fetchClassCosts,
  type ClassCost,
  type Student,
  type StudentFeeRecord,
} from "@/lib/students";

export type StudentsData = {
  loading: boolean;
  students: Student[];
  feeRecords: StudentFeeRecord[];
  classCosts: ClassCost[];
  refresh: () => Promise<void>;
};

export function useStudentsData(): StudentsData {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [feeRecords, setFeeRecords] = useState<StudentFeeRecord[]>([]);
  const [classCosts, setClassCosts] = useState<ClassCost[]>([]);

  const refresh = useCallback(async () => {
    const [st, fr, cc] = await Promise.all([
      fetchStudents(),
      fetchFeeRecords(),
      fetchClassCosts(),
    ]);
    setStudents(st);
    setFeeRecords(fr);
    setClassCosts(cc);
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

  return useMemo(
    () => ({ loading, students, feeRecords, classCosts, refresh }),
    [loading, students, feeRecords, classCosts, refresh]
  );
}
