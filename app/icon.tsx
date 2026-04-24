import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0B2D4E',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          color: 'white',
          fontSize: '13px',
          fontWeight: 900,
          letterSpacing: '-0.5px',
          fontFamily: 'sans-serif',
        }}
      >
        TM
      </div>
    ),
    { ...size },
  );
}
