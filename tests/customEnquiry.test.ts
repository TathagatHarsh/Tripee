import { describe, expect, it } from 'vitest';
import { enquiryHref, enquiryText, type Enquiry } from '@/lib/customEnquiry';

const base: Enquiry = {
  name: 'Priya', size: '2 kg', quantity: 1, sponge: 'Eggless', flavour: 'Chocolate',
  message: 'Happy Birthday Aarav', date: '2026-11-16', time: 'Evening (5pm–9pm)',
  address: '12 Lake View, Ahmedguda', pincode: '501301', notes: '',
};

describe('a custom-cake enquiry message', () => {
  it('carries every detail the bakery needs to quote', () => {
    const text = enquiryText(base, 'https://makeyourcakes.com/custom-cakes#jungle-three-tier');
    for (const want of [
      'Design: https://makeyourcakes.com/custom-cakes#jungle-three-tier',
      'Name: Priya', 'Size: 2 kg', 'Sponge: Eggless', 'Flavour: Chocolate',
      'Message on the cake: "Happy Birthday Aarav"',
      'Delivery: Mon, 16 Nov 2026, Evening (5pm–9pm)',
      'Address: 12 Lake View, Ahmedguda, 501301',
    ]) expect(text).toContain(want);
    expect(text).not.toContain('Notes:');
  });

  it('says how many cakes only when there is more than one', () => {
    expect(enquiryText({ ...base, quantity: 3 }, null)).toContain('Size: 2 kg × 3 cakes');
  });

  it('asks for the photo in the chat when there is no gallery cake', () => {
    expect(enquiryText(base, null)).toContain("Design: I'll send a photo of it in this chat.");
  });

  it('opens the bakery chat with the message encoded', () => {
    const href = enquiryHref('919989791579', base, null);
    expect(href.startsWith('https://wa.me/919989791579?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toBe(enquiryText(base, null));
  });
});
