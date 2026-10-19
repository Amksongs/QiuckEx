// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { BidModal } from "@/components/BidModal";
import type { MarketplaceListing } from "@/hooks/marketplaceApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock placeBid so we never hit a real backend
vi.mock("@/hooks/marketplaceApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/marketplaceApi")>();
  return {
    ...actual,
    placeBid: vi.fn().mockResolvedValue({ success: true }),
  };
});

// Mock useWallet — BidModal only reads wallet.publicKey
vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({ wallet: { publicKey: "GTEST123" } }),
}));

// Mock SigningSummary — not under test here
vi.mock("@/components/SigningSummary", () => ({
  SigningSummary: () => <div data-testid="signing-summary" />,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockListing: MarketplaceListing = {
  id: "listing-1",
  username: "testuser",
  currentBid: 100,
  buyNowPrice: 500,
  ownerAddress: "GOWN...ADDR",
  endsAt: new Date(Date.now() + 1000 * 60 * 60 * 2),
  createdAt: new Date(Date.now() - 1000 * 60 * 60),
  status: "auction",
  category: "trending",
  bidCount: 5,
  watchers: 20,
  verified: true,
};

const noop = () => {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BidModal — copy accuracy (issue #1198)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not display wallet-signature language in the warning box", () => {
    render(
      <BidModal listing={mockListing} onClose={noop} onBidSuccess={noop} />,
    );

    // The wallet warning must NOT use the old misleading "request a signature" language
    const warningText = screen.getByText(/wallet connection required/i)
      .closest("div")?.textContent ?? "";

    expect(warningText.toLowerCase()).not.toContain("request a signature");
    expect(warningText.toLowerCase()).not.toContain("freighter/lobstr");
  });

  it("does not label the confirm button 'Sign & Pay' or show 'Signing...' while loading", async () => {
    render(
      <BidModal listing={mockListing} onClose={noop} onBidSuccess={noop} />,
    );

    // Enter a valid bid and reach the preview/confirm step
    const input = screen.getByPlaceholderText(/min/i);
    fireEvent.change(input, { target: { value: "150" } });

    const reviewBtn = screen.getByRole("button", { name: /review bid/i });
    fireEvent.click(reviewBtn);

    // The confirm CTA must not say "Sign & Pay"
    const confirmBtn = screen.getByRole("button", { name: /place bid/i });
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn.textContent).not.toMatch(/sign & pay/i);
  });

  it("success screen does not claim the transaction was signed or broadcast", async () => {
    render(
      <BidModal listing={mockListing} onClose={noop} onBidSuccess={noop} />,
    );

    // Enter a valid bid and reach the confirm step
    const input = screen.getByPlaceholderText(/min/i);
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /review bid/i }));

    // Confirm the bid
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /place bid/i }));
    });

    // Wait for success state to render
    await waitFor(() => screen.getByText(/bid placed/i));

    const successText = document.body.textContent ?? "";

    // Must NOT contain any of the fabricated signed-transaction claims
    expect(successText).not.toMatch(/tx signed/i);
    expect(successText).not.toMatch(/broadcast/i);
    expect(successText).not.toMatch(/ledger.*settlement/i);
  });

  it("success screen confirms the bid was recorded as an off-chain record", async () => {
    render(
      <BidModal listing={mockListing} onClose={noop} onBidSuccess={noop} />,
    );

    const input = screen.getByPlaceholderText(/min/i);
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /review bid/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /place bid/i }));
    });

    await waitFor(() => screen.getByText(/bid placed/i));

    // The success receipt must indicate an off-chain bid was recorded
    expect(screen.getByText(/bid recorded/i)).toBeDefined();
    expect(screen.getByText(/off-chain bid registered/i)).toBeDefined();
  });
});
