import { create } from "zustand";

interface AppState {
  savedTenders: Set<string>;
  appliedTenders: Set<string>;
  activeFilter: string;
  selectedReviewTender: string | null;
  isAdmin: boolean;
  toggleSaved: (id: string) => void;
  toggleApplied: (id: string) => void;
  setFilter: (f: string) => void;
  setSelectedReview: (id: string | null) => void;
  setIsAdmin: (v: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  savedTenders: new Set<string>(),
  appliedTenders: new Set<string>(),
  activeFilter: "All",
  selectedReviewTender: null,
  isAdmin: false,
  toggleSaved: (id) =>
    set((s) => {
      const n = new Set(s.savedTenders);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { savedTenders: n };
    }),
  toggleApplied: (id) =>
    set((s) => {
      const n = new Set(s.appliedTenders);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { appliedTenders: n };
    }),
  setFilter: (f) => set({ activeFilter: f }),
  setSelectedReview: (id) => set({ selectedReviewTender: id }),
  setIsAdmin: (v) => set({ isAdmin: v }),
}));
