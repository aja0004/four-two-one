import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #1C1C1E 0%, #09090B 100%)',
          borderRadius: 112,
          gap: 54,
        }}
      >
        {/* Row 1: 4 Dots */}
        <div style={{ display: 'flex', gap: 48, alignItems: 'center' }}>
          <div style={{ width: 42, height: 42, borderRadius: 21, background: '#E5E5EA' }} />
          <div style={{ width: 42, height: 42, borderRadius: 21, background: '#E5E5EA' }} />
          <div style={{ width: 42, height: 42, borderRadius: 21, background: '#E5E5EA' }} />
          <div style={{ width: 42, height: 42, borderRadius: 21, background: '#E5E5EA' }} />
        </div>

        {/* Row 2: 2 Finalist Capsules */}
        <div style={{ display: 'flex', gap: 52, alignItems: 'center' }}>
          <div style={{ width: 96, height: 44, borderRadius: 22, background: '#FFFFFF' }} />
          <div style={{ width: 96, height: 44, borderRadius: 22, background: '#FFFFFF' }} />
        </div>

        {/* Row 3: 1 Winner Accent Plate */}
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            border: '6px solid rgba(10, 132, 255, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 52, height: 52, borderRadius: 26, background: '#0A84FF' }} />
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
