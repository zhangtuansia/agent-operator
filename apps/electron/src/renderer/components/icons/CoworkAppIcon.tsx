import coworkLogo from "@/assets/craft_logo_c.svg"

interface CoworkAppIconProps {
  className?: string
  size?: number
}

/**
 * CoworkAppIcon - Displays the Cowork logo icon
 */
export function CoworkAppIcon({ className, size = 64 }: CoworkAppIconProps) {
  return (
    <img
      src={coworkLogo}
      alt="Cowork"
      width={size}
      height={size}
      className={className}
    />
  )
}

// Legacy export for backward compatibility
export { CoworkAppIcon as CraftAppIcon }
