import { inspectImage } from './image-info.js';

// 1×1 images in each format (smallest valid encodings).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR4nGP4z8DwHwYYGBgYAJ/aB/k6k4j0AAAAAElFTkSuQmCC',
  'base64',
);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAQBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
const WEBP_LOSSLESS = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAQAAAAfQ//73v/+BiOh/AAA=', 'base64');

describe('inspectImage', () => {
  it('reads PNG dimensions', () => {
    expect(inspectImage(PNG)).toEqual({
      mimeType: 'image/png',
      extension: 'png',
      width: 3,
      height: 2,
    });
  });

  it('reads JPEG dimensions from the frame header', () => {
    expect(inspectImage(JPEG)).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: 4,
      height: 2,
    });
  });

  it('reads lossless WebP dimensions', () => {
    expect(inspectImage(WEBP_LOSSLESS)).toMatchObject({
      mimeType: 'image/webp',
      width: 2,
      height: 1,
    });
  });

  it('rejects SVG, HTML and truncated data whatever they claim to be', () => {
    expect(
      inspectImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ),
    ).toBeNull();
    expect(inspectImage(Buffer.from('<!doctype html><html><body>hi</body></html>'))).toBeNull();
    expect(inspectImage(PNG.subarray(0, 10))).toBeNull();
  });
});
