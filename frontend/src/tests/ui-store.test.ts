/**
 * UI Store Unit Tests
 *
 * Tests for Zustand UI state management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';

describe('UI Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useUIStore.setState({
      sidebarOpen: true,
      sidebarCollapsed: false,
      activeModal: null,
      modalData: null,
      isMobile: false,
    });
  });

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  describe('Initial State', () => {
    it('should have sidebar open initially', () => {
      const { sidebarOpen } = useUIStore.getState();
      expect(sidebarOpen).toBe(true);
    });

    it('should have sidebar not collapsed initially', () => {
      const { sidebarCollapsed } = useUIStore.getState();
      expect(sidebarCollapsed).toBe(false);
    });

    it('should have no active modal initially', () => {
      const { activeModal } = useUIStore.getState();
      expect(activeModal).toBeNull();
    });

    it('should have no modal data initially', () => {
      const { modalData } = useUIStore.getState();
      expect(modalData).toBeNull();
    });

    it('should not be mobile initially', () => {
      const { isMobile } = useUIStore.getState();
      expect(isMobile).toBe(false);
    });
  });

  // ===========================================================================
  // Sidebar Tests
  // ===========================================================================
  describe('Sidebar Actions', () => {
    it('should toggle sidebar from open to closed', () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);

      act(() => {
        useUIStore.getState().toggleSidebar();
      });

      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it('should toggle sidebar from closed to open', () => {
      useUIStore.setState({ sidebarOpen: false });

      act(() => {
        useUIStore.getState().toggleSidebar();
      });

      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it('should set sidebar open to true', () => {
      useUIStore.setState({ sidebarOpen: false });

      act(() => {
        useUIStore.getState().setSidebarOpen(true);
      });

      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it('should set sidebar open to false', () => {
      act(() => {
        useUIStore.getState().setSidebarOpen(false);
      });

      expect(useUIStore.getState().sidebarOpen).toBe(false);
    });

    it('should set sidebar collapsed to true', () => {
      act(() => {
        useUIStore.getState().setSidebarCollapsed(true);
      });

      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    });

    it('should set sidebar collapsed to false', () => {
      useUIStore.setState({ sidebarCollapsed: true });

      act(() => {
        useUIStore.getState().setSidebarCollapsed(false);
      });

      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  // ===========================================================================
  // Modal Tests
  // ===========================================================================
  describe('Modal Actions', () => {
    it('should open modal without data', () => {
      act(() => {
        useUIStore.getState().openModal('test-modal');
      });

      const { activeModal, modalData } = useUIStore.getState();
      expect(activeModal).toBe('test-modal');
      expect(modalData).toBeNull();
    });

    it('should open modal with data', () => {
      const testData = { userId: '123', action: 'delete' };

      act(() => {
        useUIStore.getState().openModal('confirm-delete', testData);
      });

      const { activeModal, modalData } = useUIStore.getState();
      expect(activeModal).toBe('confirm-delete');
      expect(modalData).toEqual(testData);
    });

    it('should close modal and clear data', () => {
      // First open a modal
      act(() => {
        useUIStore.getState().openModal('test-modal', { key: 'value' });
      });

      // Then close it
      act(() => {
        useUIStore.getState().closeModal();
      });

      const { activeModal, modalData } = useUIStore.getState();
      expect(activeModal).toBeNull();
      expect(modalData).toBeNull();
    });

    it('should replace existing modal when opening new one', () => {
      act(() => {
        useUIStore.getState().openModal('modal-1', { id: 1 });
      });

      act(() => {
        useUIStore.getState().openModal('modal-2', { id: 2 });
      });

      const { activeModal, modalData } = useUIStore.getState();
      expect(activeModal).toBe('modal-2');
      expect(modalData).toEqual({ id: 2 });
    });
  });

  // ===========================================================================
  // Mobile Tests
  // ===========================================================================
  describe('Mobile Actions', () => {
    it('should set mobile to true and close sidebar', () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);

      act(() => {
        useUIStore.getState().setIsMobile(true);
      });

      const { isMobile, sidebarOpen } = useUIStore.getState();
      expect(isMobile).toBe(true);
      expect(sidebarOpen).toBe(false);
    });

    it('should set mobile to false without affecting sidebar', () => {
      useUIStore.setState({ isMobile: true, sidebarOpen: false });

      act(() => {
        useUIStore.getState().setIsMobile(false);
      });

      const { isMobile, sidebarOpen } = useUIStore.getState();
      expect(isMobile).toBe(false);
      // Sidebar stays closed (mobile switch doesn't auto-open)
      expect(sidebarOpen).toBe(false);
    });
  });

  // ===========================================================================
  // MODAL_IDS Constants Tests
  // ===========================================================================
  describe('MODAL_IDS', () => {
    it('should have CREATE_WORKSPACE constant', () => {
      expect(MODAL_IDS.CREATE_WORKSPACE).toBe('create-workspace');
    });

    it('should have INVITE_MEMBER constant', () => {
      expect(MODAL_IDS.INVITE_MEMBER).toBe('invite-member');
    });

    it('should have CONFIRM_DELETE constant', () => {
      expect(MODAL_IDS.CONFIRM_DELETE).toBe('confirm-delete');
    });

    it('should have USER_SETTINGS constant', () => {
      expect(MODAL_IDS.USER_SETTINGS).toBe('user-settings');
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================
  describe('Integration', () => {
    it('should handle typical mobile flow', () => {
      // User opens app on mobile
      act(() => {
        useUIStore.getState().setIsMobile(true);
      });

      expect(useUIStore.getState().sidebarOpen).toBe(false);

      // User opens sidebar
      act(() => {
        useUIStore.getState().setSidebarOpen(true);
      });

      expect(useUIStore.getState().sidebarOpen).toBe(true);

      // User opens modal
      act(() => {
        useUIStore.getState().openModal(MODAL_IDS.CREATE_WORKSPACE);
      });

      expect(useUIStore.getState().activeModal).toBe('create-workspace');

      // User closes modal
      act(() => {
        useUIStore.getState().closeModal();
      });

      expect(useUIStore.getState().activeModal).toBeNull();
    });

    it('should handle typical desktop flow', () => {
      // User collapses sidebar
      act(() => {
        useUIStore.getState().setSidebarCollapsed(true);
      });

      expect(useUIStore.getState().sidebarCollapsed).toBe(true);

      // User opens user settings
      act(() => {
        useUIStore.getState().openModal(MODAL_IDS.USER_SETTINGS, { tab: 'profile' });
      });

      const { activeModal, modalData } = useUIStore.getState();
      expect(activeModal).toBe('user-settings');
      expect(modalData).toEqual({ tab: 'profile' });
    });
  });
});
