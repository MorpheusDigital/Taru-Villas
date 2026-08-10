-- Move the Daily Sustainability Checklist into the existing Morning and Night
-- Checklists. This migration is idempotent and only removes a source template
-- after both destination templates exist in the same organization.

WITH section_mapping(checklist_name, section_name, sort_order) AS (
  VALUES
    ('Morning Checklist', 'Sustainability — Energy', 0),
    ('Morning Checklist', 'Sustainability — Water', 1),
    ('Morning Checklist', 'Sustainability — Waste', 2),
    ('Morning Checklist', 'Sustainability — Chemicals', 3),
    ('Morning Checklist', 'Sustainability — Grounds & Biodiversity', 4),
    ('Morning Checklist', 'Sustainability — Guest Engagement', 5),
    ('Morning Checklist', 'Sustainability — Pest Management', 6),
    ('Morning Checklist', 'Sustainability — General', 7),
    ('Night Checklist', 'Sustainability — Energy', 0),
    ('Night Checklist', 'Sustainability — Waste', 1),
    ('Night Checklist', 'Sustainability — Chemicals', 2),
    ('Night Checklist', 'Sustainability — Guest Engagement', 3),
    ('Night Checklist', 'Sustainability — Pest Management', 4)
)
INSERT INTO sop_sections (template_id, name, sort_order)
SELECT template.id, mapping.section_name, mapping.sort_order
FROM section_mapping AS mapping
INNER JOIN sop_templates AS template ON template.name = mapping.checklist_name
WHERE NOT EXISTS (
  SELECT 1
  FROM sop_sections AS existing
  WHERE existing.template_id = template.id
    AND existing.name = mapping.section_name
);
--> statement-breakpoint

WITH item_mapping(checklist_name, section_name, content, sort_order) AS (
  VALUES
    ('Morning Checklist', 'Sustainability — Energy', 'Electricity meter reading recorded (8 AM)', 0),
    ('Morning Checklist', 'Sustainability — Energy', 'Generator hours/fuel checked (if used) (10 AM)', 1),
    ('Morning Checklist', 'Sustainability — Energy', 'Unnecessary lights/equipment switched off', 2),
    ('Morning Checklist', 'Sustainability — Energy', 'AC settings within standard (22°C) (on arrival)', 3),
    ('Morning Checklist', 'Sustainability — Water', 'Water meter reading recorded (8 AM)', 0),
    ('Morning Checklist', 'Sustainability — Water', 'Leaks checked in guest/staff/public areas', 1),
    ('Morning Checklist', 'Sustainability — Water', 'No unnecessary water wastage observed', 2),
    ('Morning Checklist', 'Sustainability — Waste', 'Waste segregated correctly', 0),
    ('Morning Checklist', 'Sustainability — Waste', 'Waste collection area clean', 1),
    ('Morning Checklist', 'Sustainability — Waste', 'Hazardous waste stored separately', 2),
    ('Morning Checklist', 'Sustainability — Waste', 'No waste piling (not collected)', 3),
    ('Morning Checklist', 'Sustainability — Chemicals', 'PPE available and being used', 0),
    ('Morning Checklist', 'Sustainability — Grounds & Biodiversity', 'No rat poison or other out', 0),
    ('Morning Checklist', 'Sustainability — Grounds & Biodiversity', 'No wildlife disturbance observed', 1),
    ('Morning Checklist', 'Sustainability — Grounds & Biodiversity', 'Checked for invasive plants; record any observance', 2),
    ('Morning Checklist', 'Sustainability — Guest Engagement', 'Sustainability information displayed', 0),
    ('Morning Checklist', 'Sustainability — Guest Engagement', 'Towel/linen reuse programme active (mainly in the morning)', 1),
    ('Morning Checklist', 'Sustainability — Pest Management', 'Ask cleaning and kitchen staff whether they noticed pest activity (for example, droppings)', 0),
    ('Morning Checklist', 'Sustainability — Pest Management', 'Record observations and remediation strategies', 1),
    ('Morning Checklist', 'Sustainability — Pest Management', 'Confirm past remediation strategies were implemented and record their effectiveness', 2),
    ('Morning Checklist', 'Sustainability — Pest Management', 'No rat poison placed (use rat cages/traps instead)', 3),
    ('Morning Checklist', 'Sustainability — General', 'Any other environmental concerns reported', 0),
    ('Morning Checklist', 'Sustainability — General', 'Corrective actions assigned', 1),
    ('Night Checklist', 'Sustainability — Energy', 'Electricity meter reading recorded (5:30 PM)', 0),
    ('Night Checklist', 'Sustainability — Energy', 'Unnecessary lights/equipment switched off', 1),
    ('Night Checklist', 'Sustainability — Energy', 'AC settings within standard (22°C) (on arrival)', 2),
    ('Night Checklist', 'Sustainability — Energy', 'Fuel logs updated (if vehicles are there)', 3),
    ('Night Checklist', 'Sustainability — Energy', 'Gas usage recorded', 4),
    ('Night Checklist', 'Sustainability — Waste', 'Waste collection area clean', 0),
    ('Night Checklist', 'Sustainability — Chemicals', 'Chemical store clean and ventilated', 0),
    ('Night Checklist', 'Sustainability — Chemicals', 'Chemical containers labelled', 1),
    ('Night Checklist', 'Sustainability — Chemicals', 'PPE available and being used', 2),
    ('Night Checklist', 'Sustainability — Chemicals', 'MSDS displayed correctly as per styling guide', 3),
    ('Night Checklist', 'Sustainability — Guest Engagement', 'Towel/linen reuse programme active (mainly in the morning)', 0),
    ('Night Checklist', 'Sustainability — Pest Management', 'No rat poison placed (use rat cages/traps instead)', 0)
)
INSERT INTO sop_items (template_id, section_id, content, sort_order)
SELECT template.id, section.id, mapping.content, mapping.sort_order
FROM item_mapping AS mapping
INNER JOIN sop_templates AS template ON template.name = mapping.checklist_name
INNER JOIN sop_sections AS section
  ON section.template_id = template.id
  AND section.name = mapping.section_name
WHERE NOT EXISTS (
  SELECT 1
  FROM sop_items AS existing
  WHERE existing.template_id = template.id
    AND existing.content = mapping.content
);
--> statement-breakpoint

DELETE FROM sop_templates AS sustainability
WHERE sustainability.name = 'Sustainability Checklist'
  AND EXISTS (
    SELECT 1
    FROM sop_templates AS morning
    WHERE morning.org_id = sustainability.org_id
      AND morning.name = 'Morning Checklist'
  )
  AND EXISTS (
    SELECT 1
    FROM sop_templates AS night
    WHERE night.org_id = sustainability.org_id
      AND night.name = 'Night Checklist'
  );
