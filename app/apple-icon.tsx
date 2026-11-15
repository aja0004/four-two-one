import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
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
          gap: 18,
        }}
      >
        {/* Row 1: 4 Dots */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 15, height: 15, borderRadius: 8, background: '#E5E5EA' }} />
          <div style={{ width: 15, height: 15, borderRadius: 8, background: '#E5E5EA' }} />
          <div style={{ width: 15, height: 15, borderRadius: 8, background: '#E5E5EA' }} />
          <div style={{ width: 15, height: 15, borderRadius: 8, background: '#E5E5EA' }} />
        </div>

        {/* Row 2: 2 Finalist Capsules */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div style={{ width: 34, height: 16, borderRadius: 8, background: '#FFFFFF' }} />
          <div style={{ width: 34, height: 16, borderRadius: 8, background: '#FFFFFF' }} />
        </div>

        {/* Row 3: 1 Winner Accent Plate */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            border: '2.5px solid rgba(10, 132, 255, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: 9, background: '#0A84FF' }} />
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
