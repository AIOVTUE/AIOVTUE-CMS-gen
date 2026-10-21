import { Field } from "@/types/field";
import { extensionCategories } from "@/lib/utils/file";

export const getAllowedExtensions = (
  field: Field,
  mediaConfig: any,
): string[] | undefined => {
  const baseExtensions = [...(extensionCategories["image"] || [])];

  if (!mediaConfig) return baseExtensions;
  if (!field.options?.extensions && !field.options?.categories) {
    return mediaConfig?.extensions || baseExtensions;
  }

  let extensions = baseExtensions;

  if (field.options?.extensions && Array.isArray(field.options?.extensions)) {
    extensions = [...field.options?.extensions];
  } else if (Array.isArray(field.options?.categories)) {
    extensions = field.options?.categories.flatMap(
      (category: string) => extensionCategories[category] || [],
    );
  } else if (mediaConfig?.extensions && Array.isArray(mediaConfig.extensions)) {
    extensions = [...mediaConfig.extensions];
  }

  if (
    extensions.length > 0 &&
    mediaConfig?.extensions &&
    Array.isArray(mediaConfig.extensions)
  ) {
    extensions = extensions.filter((ext) =>
      mediaConfig.extensions.includes(ext),
    );
  }

  return extensions;
};
