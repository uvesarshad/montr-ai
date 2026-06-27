export interface LinkableResource {
  _id: string;
  title: string;
  updatedAt?: string | null;
}

export function getSortedLinkableResources<T extends LinkableResource>(
  resources: T[],
  currentId?: string | null
) {
  return [...resources]
    .filter((resource) => resource._id !== currentId)
    .sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;

      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return left.title.localeCompare(right.title);
    });
}
