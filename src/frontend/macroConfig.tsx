import React from 'react';
import ForgeReconciler, {
  Label,
  Select,
  Stack,
  Textfield,
  Toggle,
} from '@forge/react';

const MODE_OPTIONS = [
  { label: 'Verified FAQs Only (Accepted Solutions)', value: 'accepted' },
  { label: 'All Questions (Most Voted)', value: 'all' },
  { label: 'Unanswered Questions Queue', value: 'unanswered' },
  { label: 'Filter by Specific Tag', value: 'tag' },
];

const SCOPE_OPTIONS = [
  { label: 'Current Space Only', value: 'current' },
  { label: 'All Spaces (Company-Wide)', value: 'global' },
];

const MAX_OPTIONS = [
  { label: '5 Questions', value: '5' },
  { label: '10 Questions', value: '10' },
  { label: '20 Questions', value: '20' },
];

const MacroConfigApp = () => {
  return (
    <Stack space="space.150">
      <Label labelFor="heading">Section Heading</Label>
      <Textfield name="heading" id="heading" defaultValue="Verified Team Q&A & FAQ" />

      <Label labelFor="mode">Display Mode</Label>
      <Select name="mode" inputId="mode" options={MODE_OPTIONS} defaultValue={MODE_OPTIONS[0]} />

      <Label labelFor="tagFilter">Tag Filter (used when Display Mode is Filter by Specific Tag)</Label>
      <Textfield name="tagFilter" id="tagFilter" placeholder="e.g., onboarding" />

      <Label labelFor="spaceScope">Space Scope</Label>
      <Select
        name="spaceScope"
        inputId="spaceScope"
        options={SCOPE_OPTIONS}
        defaultValue={SCOPE_OPTIONS[0]}
      />

      <Label labelFor="showAcceptedAnswers">Show Verified Accepted Answers Inline</Label>
      <Toggle name="showAcceptedAnswers" id="showAcceptedAnswers" defaultChecked />

      <Label labelFor="maxItems">Maximum Items</Label>
      <Select
        name="maxItems"
        inputId="maxItems"
        options={MAX_OPTIONS}
        defaultValue={MAX_OPTIONS[1]}
      />
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <MacroConfigApp />
  </React.StrictMode>
);
