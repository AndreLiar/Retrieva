import { create } from 'zustand';

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;

  // Modals
  activeModal: string | null;
  modalData: Record<string, unknown> | null;

  // Mobile
  isMobile: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openModal: (modalId: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  setIsMobile: (isMobile: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  activeModal: null,
  modalData: null,
  isMobile: false,

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
  },

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
  },

  openModal: (modalId, data) => {
    set({ activeModal: modalId, modalData: data || null });
  },

  closeModal: () => {
    set({ activeModal: null, modalData: null });
  },

  setIsMobile: (isMobile) => {
    set({ isMobile });
    // Auto-close sidebar on mobile
    if (isMobile) {
      set({ sidebarOpen: false });
    }
  },
}));

// Modal IDs for type safety
export const MODAL_IDS = {
  CREATE_WORKSPACE: 'create-workspace',
  INVITE_MEMBER: 'invite-member',
  CONFIRM_DELETE: 'confirm-delete',
  USER_SETTINGS: 'user-settings',
} as const;

export type ModalId = (typeof MODAL_IDS)[keyof typeof MODAL_IDS];
