import { nameStyleProps } from '../lib/namestyles'

/** Name rendered with its style. Truncates like the surrounding UI. */
export default function StyledName({
  name,
  styleId,
  className,
  title,
}: {
  name: string
  styleId?: string
  className?: string
  title?: string
}) {
  return (
    <span className={className} title={title ?? name} style={nameStyleProps(styleId)}>
      {name}
    </span>
  )
}
