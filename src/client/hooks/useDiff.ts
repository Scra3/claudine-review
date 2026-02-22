import { useState, useEffect, useCallback } from "react";
import type { DiffResponse } from "../../shared/types";
import { fetchDiff } from "../api";

export function useDiff() {
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffChanged, setDiffChanged] = useState(false);

  useEffect(() => {
    fetchDiff()
      .then((data) => {
        setDiff(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const notifyDiffChanged = useCallback(() => {
    setDiffChanged(true);
  }, []);

  const refreshDiff = useCallback(() => {
    setDiffChanged(false);
    fetchDiff()
      .then((data) => setDiff(data))
      .catch(() => {});
  }, []);

  return { diff, loading, error, diffChanged, notifyDiffChanged, refreshDiff };
}
