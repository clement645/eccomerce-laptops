/** Starter buying guides. General, factual advice; no product claims or fabricated statistics. */
export const blogCategories = [
  { slug: 'buying-guides', name: 'Buying Guides', description: 'Help choosing the right device.' },
  {
    slug: 'tips-and-maintenance',
    name: 'Tips & Maintenance',
    description: 'Get more from the tech you own.',
  },
];

export const blogPosts = [
  {
    slug: 'best-laptops-for-students',
    title: 'Best Laptops for Students: What to Look For',
    category: 'buying-guides',
    publishedDaysAgo: 20,
    excerpt: 'Battery life, weight and enough memory matter more than raw power for most students.',
    contentHtml: `<p>Most coursework involves documents, research, video lectures and the occasional presentation. That means a student laptop should prioritise reliability, battery life and portability over top-end performance.</p>
<h2>Key specifications</h2>
<ul>
<li><strong>Memory:</strong> 8GB is the practical minimum today; 16GB keeps many browser tabs and apps running smoothly.</li>
<li><strong>Storage:</strong> choose an SSD. 256GB works if you use cloud storage; 512GB gives more breathing room.</li>
<li><strong>Display:</strong> a Full HD (1920 x 1080) screen or better is easier on the eyes during long study sessions.</li>
<li><strong>Weight:</strong> if you carry it to campus daily, aim for under about 1.7kg.</li>
</ul>
<h2>Courses with heavier needs</h2>
<p>Engineering, architecture and media students may run CAD, 3D or video software. Check your department's recommended specifications; a dedicated graphics card may be required.</p>`,
  },
  {
    slug: 'gaming-laptop-buying-guide',
    title: 'Gaming Laptop Buying Guide',
    category: 'buying-guides',
    publishedDaysAgo: 14,
    excerpt:
      'The graphics card matters most, but cooling, display refresh rate and memory complete the picture.',
    contentHtml: `<p>A gaming laptop is a balance between performance, heat and portability. Understanding a few components makes comparing models much easier.</p>
<h2>Graphics card first</h2>
<p>The GPU has the biggest influence on frame rates. Within a GPU family, higher model numbers are generally faster, but laptop power limits vary, so the same GPU can perform differently in different laptops.</p>
<h2>Display</h2>
<p>A refresh rate of 144Hz or higher makes fast games feel smoother. Make sure the GPU can actually deliver frame rates close to the display's refresh rate at its resolution.</p>
<h2>Memory and storage</h2>
<ul>
<li>16GB of RAM is a sensible baseline for modern games.</li>
<li>Games are large, so 512GB fills quickly; 1TB or an upgradeable second slot is useful.</li>
</ul>
<h2>Cooling and power</h2>
<p>Gaming laptops draw a lot of power and get warm. Use them on a hard, flat surface and plug in while gaming for full performance.</p>`,
  },
  {
    slug: 'how-to-choose-a-business-laptop',
    title: 'How to Choose a Business Laptop',
    category: 'buying-guides',
    publishedDaysAgo: 9,
    excerpt:
      'Durability, security features, warranty and manageability set business laptops apart.',
    contentHtml: `<p>Business laptops are built for daily use over several years. Beyond performance, consider the total cost of ownership.</p>
<h2>What sets them apart</h2>
<ul>
<li><strong>Build quality:</strong> sturdier hinges, spill-resistant keyboards and durability testing.</li>
<li><strong>Security:</strong> TPM chips, fingerprint readers, IR cameras for Windows Hello and BIOS-level protection.</li>
<li><strong>Operating system:</strong> Windows Pro editions add BitLocker encryption and easier domain management.</li>
<li><strong>Warranty and support:</strong> longer warranty options reduce downtime for your team.</li>
</ul>
<h2>Standardise where you can</h2>
<p>Buying the same model for a team simplifies spare parts, docking stations and IT support.</p>`,
  },
  {
    slug: 'ssd-vs-hdd',
    title: 'SSD vs HDD: Which Storage Do You Need?',
    category: 'buying-guides',
    publishedDaysAgo: 5,
    excerpt: 'SSDs are faster and more durable; hard drives still offer cheap bulk capacity.',
    contentHtml: `<p>Storage affects how quickly your computer starts, opens apps and loads files.</p>
<h2>Solid-state drives (SSD)</h2>
<p>SSDs use flash memory with no moving parts. They are much faster, quieter and more resistant to knocks than hard drives, which is why almost all new laptops use them. NVMe SSDs connect over PCIe and are faster again than SATA SSDs.</p>
<h2>Hard disk drives (HDD)</h2>
<p>HDDs store data on spinning platters. They are slower, but offer large capacities at a low cost per gigabyte, which makes them useful for backups and media archives.</p>
<h2>Our recommendation</h2>
<p>Use an SSD for your operating system and applications. Add an external drive, SSD or HDD, for backups.</p>`,
  },
  {
    slug: 'laptop-maintenance-tips',
    title: 'Laptop Maintenance Tips That Extend Its Life',
    category: 'tips-and-maintenance',
    publishedDaysAgo: 1,
    excerpt: 'Simple habits for cleaning, cooling, battery care and software upkeep.',
    contentHtml: `<p>A little regular care keeps a laptop running well for years.</p>
<ul>
<li><strong>Keep vents clear:</strong> avoid using the laptop on beds or cushions, which block airflow.</li>
<li><strong>Clean gently:</strong> power off, then use a soft microfibre cloth. Never spray liquid directly onto the screen or keyboard.</li>
<li><strong>Update regularly:</strong> install operating system, driver and security updates.</li>
<li><strong>Protect against power problems:</strong> use a surge protector where power is unstable.</li>
<li><strong>Back up:</strong> keep copies of important files on an external drive or cloud service.</li>
<li><strong>Transport safely:</strong> use a padded sleeve or bag, and avoid carrying it by the screen.</li>
</ul>`,
  },
];
