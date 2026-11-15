import { NextRequest, NextResponse } from 'next/server';
import { DeliveryPlatformId } from '@/lib/types';
import {
  buildInstantDuckyRedirectUrl,
  resolveDirectStorefrontUrl,
} from '@/lib/delivery-lookup';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = (searchParams.get('platform') ||
    'deliveroo') as DeliveryPlatformId;
  const name = searchParams.get('name')?.trim() || '';
  const area = searchParams.get('area')?.trim() || 'London';
  const wantsJson = searchParams.get('json') === '1';

  if (!name) {
    if (wantsJson) {
      return NextResponse.json({ storeUrl: null });
    }
    return NextResponse.redirect('https://deliveroo.co.uk/', 302);
  }

  try {
    let { storeUrl } = await resolveDirectStorefrontUrl(
      platform,
      name,
      area,
      3500
    );

    if (!storeUrl && area.toLowerCase() !== 'london') {
      const retry = await resolveDirectStorefrontUrl(
        platform,
        name,
        'London',
        3000
      );
      storeUrl = retry.storeUrl;
    }

    if (wantsJson) {
      return NextResponse.json({ storeUrl });
    }

    if (storeUrl) {
      return NextResponse.redirect(storeUrl, 302);
    }
  } catch {
    if (wantsJson) {
      return NextResponse.json({ storeUrl: null });
    }
  }

  // Fallback: DuckDuckGo `\` ("I'm Feeling Ducky") auto-redirects straight to the top storefront result
  const duckyUrl = buildInstantDuckyRedirectUrl(platform, name, area);
  return NextResponse.redirect(duckyUrl, 302);
}
