import { IconClose } from './icons'

interface Props {
  onClose: () => void
}

export default function DetailsPanel({ onClose }: Props) {
  return (
    <aside className="details" aria-label="详情">
      <div className="details-head">
        <span className="details-title">详情</span>
        <button className="details-close" aria-label="关闭详情" onClick={onClose}>
          <IconClose size={14} />
        </button>
      </div>
      <div className="details-body">
        <div className="details-empty">点击消息流中的工具行查看详情</div>
      </div>
    </aside>
  )
}
