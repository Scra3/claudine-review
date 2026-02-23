import React, { useState } from "react";
import type { Summary } from "../../shared/types";

interface Props {
  summary: Summary;
}

function completeModifier(base: string, isComplete: boolean): string {
  return isComplete ? `${base} ${base}--complete` : base;
}

export function SummaryPanel({ summary }: Props) {
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState<boolean[]>(
    () => new Array(summary.testPlan.length).fill(false),
  );

  const checkedCount = checked.filter(Boolean).length;
  const totalSteps = summary.testPlan.length;
  const allComplete = totalSteps > 0 && checkedCount === totalSteps;

  function handleCheck(index: number): void {
    setChecked((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  const chevronClass = open
    ? "summary-panel__chevron summary-panel__chevron--open"
    : "summary-panel__chevron";

  return (
    <div className="summary-panel">
      <button
        className="summary-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="summary-panel-content"
      >
        <span className={chevronClass}>
          ▶
        </span>
        <span className="summary-panel__title">Review Summary</span>
        {!open && totalSteps > 0 && (
          <span className={completeModifier("summary-panel__collapsed-meta", allComplete)}>
            {checkedCount}/{totalSteps} steps ✓
          </span>
        )}
      </button>

      {open && (
        <div id="summary-panel-content" className="summary-panel__body">
          <div className="summary-panel__section summary-panel__section--summary">
            <div className="summary-panel__persona">Summary</div>
            <div className="summary-panel__summary-text">{summary.global}</div>
          </div>

          {totalSteps > 0 && (
            <div className={`summary-panel__section summary-panel__section--testplan ${allComplete ? "summary-panel__section--testplan-complete" : ""}`}>
              <div className="summary-panel__persona">
                Test Plan
                <span className={completeModifier("summary-panel__step-counter", allComplete)}>
                  {checkedCount}/{totalSteps} ✓
                </span>
              </div>
              <div className="summary-panel__steps">
                {summary.testPlan.map((step, i) => (
                  <label
                    key={i}
                    className={`summary-panel__step ${checked[i] ? "summary-panel__step--checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="summary-panel__step-checkbox"
                      checked={checked[i]}
                      onChange={() => handleCheck(i)}
                    />
                    <span className="summary-panel__step-text">
                      <span className="summary-panel__step-desc">{step.description}</span>
                      <span className="summary-panel__step-expected">Expected: {step.expected}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
