export function selectBoxLocation(pendingLocations: string[], selected: string | null, editingLocation: string | null) {
  if (editingLocation) return editingLocation;
  return selected && pendingLocations.includes(selected) ? selected : pendingLocations[0];
}