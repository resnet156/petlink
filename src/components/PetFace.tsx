import type { PetState } from '@/domain/types'
import { PetSvg } from '@/components/PetSvg'

/** 宠物头像：有上传真实照片则显示照片（圆形裁剪），否则用卡通 PetSvg。地图/首页/切换均复用。 */
export function PetFace({ pet, size }: { pet: PetState; size: number }) {
  if (pet.photo) {
    return (
      <img
        src={pet.photo}
        alt={pet.name}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return <PetSvg behavior={pet.behavior} size={size} />
}
