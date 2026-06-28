"use client";

import { useEffect, useMemo, useState } from "react";

const OTHER_SPECIALIZATION = "Other";
const DOCTOR_SPECIALIZATIONS = [
  "General Physician",
  "Family Medicine",
  "Internal Medicine",
  "Pediatrics",
  "Obstetrics and Gynecology",
  "Cardiology",
  "Anesthesiology",
  "Dermatology",
  "Emergency Medicine",
  "Endocrinology",
  "ENT",
  "Gastroenterology",
  "Nephrology",
  "Neurology",
  "Oncology",
  "Ophthalmology",
  "Orthopedics",
  "Pathology",
  "Psychiatry",
  "Pulmonology",
  "Radiology",
  "Rheumatology",
  "Surgery",
  "Urology",
  OTHER_SPECIALIZATION
] as const;

function isCuratedSpecialization(value: string): boolean {
  return DOCTOR_SPECIALIZATIONS.some((specialization) => specialization !== OTHER_SPECIALIZATION && specialization === value);
}

export function SpecializationField({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const initialChoice = useMemo(() => {
    if (!value) {
      return "";
    }

    return isCuratedSpecialization(value) ? value : OTHER_SPECIALIZATION;
  }, [value]);
  const [choice, setChoice] = useState(initialChoice);
  const [otherValue, setOtherValue] = useState(initialChoice === OTHER_SPECIALIZATION ? value : "");

  useEffect(() => {
    if (!value && choice === OTHER_SPECIALIZATION) {
      return;
    }

    const nextChoice = value ? (isCuratedSpecialization(value) ? value : OTHER_SPECIALIZATION) : "";
    setChoice(nextChoice);
    setOtherValue(nextChoice === OTHER_SPECIALIZATION ? value : "");
  }, [choice, value]);

  function handleChoice(nextChoice: string) {
    setChoice(nextChoice);

    if (nextChoice === OTHER_SPECIALIZATION) {
      setOtherValue("");
      onChange("");
      return;
    }

    onChange(nextChoice);
  }

  function handleOther(nextValue: string) {
    setOtherValue(nextValue);
    onChange(nextValue);
  }

  return (
    <div className="grid gap-3">
      <label className="block">
        <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
          Specialization
        </span>
        <select
          className="mt-2 min-h-11 w-full rounded-xl border border-rule bg-paper-deep px-3 font-body text-sm text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
          value={choice}
          onChange={(event) => handleChoice(event.target.value)}
          aria-label="Specialization"
        >
          <option value="">Select specialization</option>
          {DOCTOR_SPECIALIZATIONS.map((specialization) => (
            <option key={specialization} value={specialization}>
              {specialization}
            </option>
          ))}
        </select>
      </label>

      {choice === OTHER_SPECIALIZATION ? (
        <label className="block">
          <span className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
            Other specialization
          </span>
          <input
            className="mt-2 min-h-11 w-full rounded-xl border border-rule bg-paper-deep px-3 font-body text-sm text-ink outline-none focus:ring-2 focus:ring-terracotta/20"
            value={otherValue}
            onChange={(event) => handleOther(event.target.value)}
            aria-label="Other specialization"
            placeholder="Enter your specialization"
          />
        </label>
      ) : null}
    </div>
  );
}
