import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { IssueCatalogue } from "@/components/site/issue-catalogue";
import { bugCount, featureCount, issues, openIssues } from "@/data/issues";

export const metadata: Metadata = {
  title: "The 59 issues",
  description:
    "Every issue that built Component Picker — what was wrong, what proves it is fixed, and what to film for each one.",
};

export default function IssuesPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-4">
        <Badge variant="outline" className="w-fit font-mono text-[11px]">
          the whole board
        </Badge>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {issues.length} issues. {featureCount} features, {bugCount} bugs, and{" "}
          {openIssues.length} still open.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Each one names the thing that was wrong, the acceptance criterion that proves it is
          not wrong any more, and the exact shot that shows it on camera. Open any card for its
          video slot and its steps.
        </p>
      </header>
      <IssueCatalogue />
    </div>
  );
}
