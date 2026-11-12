import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Stat } from "@/components/ui/stat";
import { Stepper } from "@/components/ui/stepper";
import { MotionProvider } from "@/lib/motion";

describe("Core UI components", () => {
  it("renders MoneyText and DateText cleanly", () => {
    render(
      <MotionProvider>
        <MoneyText minorUnits={100000000} currency="INR" animated={false} />
        <DateText date="2026-11-12T18:30:00Z" />
      </MotionProvider>
    );

    expect(screen.getByText("₹10,00,000 INR")).toBeInTheDocument();
    expect(screen.getByText("13 Nov 2026")).toBeInTheDocument();
  });

  it("renders Button variants and loading state without spinner", () => {
    render(
      <MotionProvider>
        <Button variant="primary">Save</Button>
        <Button variant="destructive" loading loadingText="Deleting...">
          Delete
        </Button>
      </MotionProvider>
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    const loadingBtn = screen.getByRole("button", { name: "Deleting..." });
    expect(loadingBtn).toBeDisabled();
    expect(loadingBtn).toHaveAttribute("aria-busy", "true");
  });

  it("renders Input with accessible label and error alert", () => {
    render(<Input label="IEC Code" error="Must be 10 characters" />);
    const input = screen.getByLabelText("IEC Code");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Must be 10 characters");
  });

  it("renders ProgressRing, Stepper, Badge, Stat, and EmptyState", () => {
    render(
      <MotionProvider>
        <Badge variant="success">Matched</Badge>
        <Stat label="Total Claimed" minorUnits={500000} animated={false} />
        <ProgressRing value={75} label="Deadline" />
        <Stepper
          steps={[
            { id: "1", label: "Upload" },
            { id: "2", label: "Review" },
          ]}
          currentStep={1}
        />
        <EmptyState title="No items" description="Upload a file to begin." />
      </MotionProvider>
    );

    expect(screen.getByText("Matched")).toBeInTheDocument();
    expect(screen.getByText("₹5,000 INR")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Deadline" })).toHaveAttribute(
      "aria-valuenow",
      "75"
    );
    expect(screen.getByText("Review").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("No items")).toBeInTheDocument();
  });

  it("renders DataTable desktop markup and mobile card list markup and triggers row click", () => {
    interface Row {
      id: string;
      sb: string;
      buyer: string;
    }

    const rows: Row[] = [{ id: "1", sb: "8492014", buyer: "Nordic Knitwear" }];
    const cols: DataTableColumn<Row>[] = [
      { id: "sb", header: "SB Number", cell: (r) => r.sb },
      { id: "buyer", header: "Buyer", cell: (r) => r.buyer },
    ];
    const onRowClick = vi.fn();

    render(
      <MotionProvider>
        <DataTable
          data={rows}
          columns={cols}
          keyExtractor={(r) => r.id}
          mobileTitle={(r) => r.sb}
          onRowClick={onRowClick}
          animated={false}
        />
      </MotionProvider>
    );

    expect(screen.getByTestId("data-table-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("data-table-mobile")).toBeInTheDocument();

    const mobileCardButton = screen.getByTestId("data-table-mobile").querySelector("button");
    expect(mobileCardButton).not.toBeNull();
    fireEvent.click(mobileCardButton!);
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});
