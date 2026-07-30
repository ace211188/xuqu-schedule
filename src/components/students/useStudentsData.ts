"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchStudents,
  fetchFeeRecords,
  type Student,
  type StudentFeeRecord,
} from "@/lib/students";

export type StudentsData = {
  loading: boolean;
  students: Student[];
  feeRecords: StudentFeeRecord[];
  refresh: () => Promise<void>;
};

export function useStudentsData(): StudentsData {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [feeRecords, setFeeRecords] = useState<StudentFeeRecord[]>([]);

  const refresh = useCallback(async () => {
    const [st, fr] = await Promise.all([fetchStudents(), fetchFeeRecords()]);
    setStudents(st);
    setFeeRecords(fr);
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

  // 記憶化：避免每次 render 都產生新物件讓下游 memo 失效
  return useMemo(
    () => ({ loading, students, feeRecords, refresh }),
    [loading, students, feeRecords, refresh]
  );
}
