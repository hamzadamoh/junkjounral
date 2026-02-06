# Pinterest Halal Content Scraper with Google Sheets Duplicate Check
import requests
import json
import time
import urllib.parse
import csv
import re
import random
from datetime import datetime, timedelta
from google.colab import files
import os

print("🔧 Pinterest Halal Content Scraper with Google Sheets Duplicate Check")
print("="*60)

# ----------------------------
# Get user input
# ----------------------------
query = input("Enter search keyword (e.g., 'easy dinner recipes'): ").strip()
pages_to_scrape = int(input("Enter number of pages to scrape (default 5): ") or "5")

# Pinterest cookies
csrftoken = input("Enter csrftoken cookie value: ").strip()
pinterest_sess = input("Enter _pinterest_sess cookie value: ").strip()

# Google Sheets info
print("\n📊 Google Sheets Configuration (for duplicate checking)")
print("-" * 40)
sheet_id = input("Enter Google Sheet ID: ").strip()
sheet_name = input("Enter Sheet name (default: 'Sheet1'): ").strip() or "Sheet1"

# ----------------------------
# Configuration
# ----------------------------
class PinterestScraperConfig:
    """Configuration for Pinterest scraping and filtering"""

    # Commercial domains to AVOID/EXCLUDE
    COMMERCIAL_DOMAINS = {
        'etsy.com', 'amazon.com', 'shopify.com', 'redbubble.com',
        'teepublic.com', 'society6.com', 'zazzle.com', 'cafepress.com',
        'ebay.com', 'aliexpress.com', 'wish.com', 'banggood.com',
        'target.com', 'walmart.com', 'bestbuy.com', 'homedepot.com',
        'lowes.com', 'sephora.com', 'ulta.com', 'macys.com',
        'printful.com', 'printify.com', 'spreadshirt.com', 'threadless.com',
        '.myshopify.com', '.bigcartel.com', '.ecwid.com', '.woocommerce.com',
    }

    # Haram/Halal filter keywords
    BANNED_KEYWORDS = {
        'pork', 'bacon', 'ham', 'sausage', 'pepperoni', 'salami', 'prosciutto',
        'lard', 'gelatin', 'rennet', 'animal fat', 'alcohol', 'wine', 'beer',
        'whiskey', 'vodka', 'rum', 'tequila', 'liquor', 'cocktail', 'moonshine',
        'haram', 'non-halal', 'forbidden', 'prohibited'
    }

    # Halal-friendly alternative keywords
    HALAL_KEYWORDS = {
        'halal', 'halal certified', 'zabiha', 'no pork', 'no alcohol',
        'alcohol-free', 'pork-free', 'muslim friendly', 'islamic',
        'permissible', 'allowed', 'tayyib'
    }

    BASE_URL = "https://www.pinterest.com/resource/BaseSearchResource/get/"

    @classmethod
    def get_headers(cls, csrftoken, pinterest_sess, encoded_query):
        """Generate headers for Pinterest API requests"""
        source_url_param = f"/search/pins/?q={encoded_query}&rs=typed"

        return {
            "accept": "application/json, text/javascript, */*, q=0.01",
            "accept-language": "en-US,en;q=0.9",
            "cookie": f'csrftoken={csrftoken}; _pinterest_sess={pinterest_sess}; _auth=0;',
            "referer": "https://www.pinterest.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
            "x-app-version": "8d282e3",
            "x-requested-with": "XMLHttpRequest",
            "x-csrftoken": csrftoken,
            "x-pinterest-source-url": source_url_param,
            "x-pinterest-pws-handler": "www/search/[scope].js",
            "x-pinterest-appstate": "active"
        }

# ----------------------------
# Helper functions
# ----------------------------
def extract_domain(url):
    """Extract domain from URL"""
    if not url or not isinstance(url, str):
        return ""

    domain = re.sub(r'^https?://(www\.)?', '', url.lower())
    domain = domain.split('/')[0]
    return domain

def is_commercial_link(url):
    """Check if link is to a commercial site"""
    if not url or not isinstance(url, str):
        return False

    url_lower = url.lower()

    for commercial_domain in PinterestScraperConfig.COMMERCIAL_DOMAINS:
        if commercial_domain in url_lower:
            return True

    shopping_patterns = [
        r'/product/', r'/products/', r'/shop/', r'/store/', r'/buy/',
        r'/cart/', r'/checkout/', r'/add-to-cart', r'/purchase/',
        r'\?variant=', r'\?sku=', r'\?product_id=', r'add_to_cart',
        r'\.store$', r'\.shop$', r'/listing/', r'/item/'
    ]

    for pattern in shopping_patterns:
        if re.search(pattern, url_lower):
            return True

    return False

def contains_banned_keywords(text):
    """Check if text contains haram/banned keywords"""
    if not text or not isinstance(text, str):
        return False

    text_lower = text.lower()
    return any(keyword in text_lower for keyword in PinterestScraperConfig.BANNED_KEYWORDS)

def contains_halal_keywords(text):
    """Check if text contains halal-friendly keywords"""
    if not text or not isinstance(text, str):
        return False

    text_lower = text.lower()
    return any(keyword in text_lower for keyword in PinterestScraperConfig.HALAL_KEYWORDS)

def calculate_pin_age(created_at):
    """Calculate pin age in days/months/years"""
    try:
        if not created_at:
            return {"days": 0, "human_readable": "Unknown"}

        if isinstance(created_at, str):
            if 'T' in created_at:
                created_at = created_at.replace('Z', '+00:00')
                if '.' in created_at:
                    created_at = created_at.split('.')[0] + '+00:00'
                pin_date = datetime.fromisoformat(created_at)
            else:
                for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%d-%m-%Y', '%d/%m/%Y']:
                    try:
                        pin_date = datetime.strptime(created_at, fmt)
                        break
                    except:
                        continue
                else:
                    return {"days": 0, "human_readable": "Unknown"}
        else:
            return {"days": 0, "human_readable": "Unknown"}

        current_date = datetime.now()
        delta = current_date - pin_date

        years = delta.days // 365
        months = (delta.days % 365) // 30
        days = delta.days % 30

        return {
            "days": delta.days,
            "months": months,
            "years": years,
            "human_readable": f"{years}y {months}m {days}d" if years > 0 else f"{months}m {days}d" if months > 0 else f"{delta.days}d"
        }
    except Exception as e:
        return {"days": 0, "human_readable": "Unknown"}

def clean_text(text, max_length=None):
    """Clean text by removing special characters and extra whitespace."""
    if not text:
        return ""

    if isinstance(text, dict):
        text = json.dumps(text)

    text = str(text)
    text = re.sub(r'[^\w\s.,!?-]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()

    if max_length:
        text = text[:max_length]

    return text

def extract_save_count(pin_data):
    """Extract save count from pin data"""
    try:
        saves = 0

        # Method 1: Check aggregated_pin_data
        aggregated_data = pin_data.get("aggregated_pin_data", {})
        if isinstance(aggregated_data, dict):
            saves = aggregated_data.get("aggregated_stats", {}).get("saves", 0)
            if not saves:
                saves = aggregated_data.get("save_count", 0)

        # Method 2: Check stats directly
        if not saves:
            stats = pin_data.get("stats", {})
            if isinstance(stats, dict):
                saves = stats.get("saves", 0)
                if not saves:
                    saves = stats.get("save_count", 0)

        # Method 3: Check for other fields
        if not saves:
            saves = pin_data.get("like_count", 0)
            if not saves:
                saves = pin_data.get("reaction_counts", {}).get("1", 0)

        # Method 4: Check visual_annotation
        if not saves:
            visual_annotation = pin_data.get("visual_annotation", {})
            if isinstance(visual_annotation, dict):
                saves = visual_annotation.get("save_count", 0)

        # Method 5: Search for any field with "save" in name
        if saves == 0:
            for key, value in pin_data.items():
                if 'save' in key.lower() and isinstance(value, (int, float)):
                    saves = int(value)
                    break

        try:
            saves = int(saves)
        except:
            saves = 0

        return max(0, saves)

    except Exception as e:
        return 0

def extract_image_url(pin_data):
    """Extract image URL from pin data"""
    try:
        images = pin_data.get("images", {})

        size_keys = ['orig', '736x', '564x', '474x', '236x', '170x']
        for size in size_keys:
            if size in images:
                size_data = images[size]
                if isinstance(size_data, dict):
                    url = size_data.get("url")
                    if url:
                        return url
                elif isinstance(size_data, str):
                    return size_data

        image = pin_data.get("image", {})
        if isinstance(image, dict) and "url" in image:
            return image["url"]

        return ""

    except Exception as e:
        return ""

# ----------------------------
# Google Sheets Integration
# ----------------------------
def setup_google_sheets():
    """Setup Google Sheets authentication"""
    print("\n🔐 Setting up Google Sheets authentication...")

    # Install required packages
    !pip install gspread google-auth google-auth-oauthlib google-auth-httplib2 -q

    import gspread
    from google.colab import auth
    from google.auth import default

    # Authenticate
    auth.authenticate_user()
    creds, _ = default()
    gc = gspread.authorize(creds)

    print("✅ Google Sheets authentication successful!")
    return gc

def get_existing_pins_from_sheet(gc, sheet_id, sheet_name):
    """Get existing Pinterest pins from Google Sheet to check for duplicates"""
    print(f"\n📋 Checking Google Sheet for existing pins...")
    print(f"   Sheet ID: {sheet_id}")
    print(f"   Sheet name: {sheet_name}")

    try:
        # Open the spreadsheet
        spreadsheet = gc.open_by_key(sheet_id)

        # Get the worksheet
        try:
            worksheet = spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            print(f"❌ Worksheet '{sheet_name}' not found!")
            print("   Available worksheets:")
            for ws in spreadsheet.worksheets():
                print(f"   - {ws.title}")
            return set()

        # Get all values from the sheet
        all_values = worksheet.get_all_values()

        if not all_values or len(all_values) <= 1:  # Only header or empty
            print("✅ Sheet is empty or has only headers")
            return set()

        # Extract Pinterest links - check multiple columns
        existing_pins = set()
        header = all_values[0]

        # Look for columns that might contain Pinterest links
        link_columns = []
        for i, col_name in enumerate(header):
            col_lower = col_name.lower()
            if any(keyword in col_lower for keyword in ['link', 'url', 'pinterest', 'pin']):
                link_columns.append(i)

        if not link_columns:
            # If no obvious link columns, check all columns for Pinterest URLs
            print("   No obvious link columns found, scanning all cells...")
            for row_idx, row in enumerate(all_values[1:], 1):  # Skip header
                for cell in row:
                    if 'pinterest.com/pin/' in cell:
                        # Extract pin ID
                        match = re.search(r'pinterest\.com/pin/(\d+)', cell)
                        if match:
                            existing_pins.add(match.group(1))
        else:
            # Check specific columns for Pinterest links
            for row_idx, row in enumerate(all_values[1:], 1):  # Skip header
                for col_idx in link_columns:
                    if col_idx < len(row):
                        cell = row[col_idx]
                        if 'pinterest.com/pin/' in cell:
                            # Extract pin ID
                            match = re.search(r'pinterest\.com/pin/(\d+)', cell)
                            if match:
                                existing_pins.add(match.group(1))

        print(f"✅ Found {len(existing_pins)} existing pins in Google Sheet")
        return existing_pins

    except Exception as e:
        print(f"❌ Error accessing Google Sheet: {e}")
        return set()

# ----------------------------
# Pinterest Scraper Class
# ----------------------------
class PinterestHalalScraper:
    def __init__(self, csrftoken, pinterest_sess, query, existing_pins=None):
        self.csrftoken = csrftoken
        self.pinterest_sess = pinterest_sess
        self.query = query
        self.encoded_query = urllib.parse.quote(query)
        self.headers = PinterestScraperConfig.get_headers(
            csrftoken, pinterest_sess, self.encoded_query
        )
        self.session = requests.Session()
        self.session.headers.update(self.headers)

        self.all_pins = []
        self.filtered_pins = []
        self.unique_filtered_pins = []  # After duplicate removal
        self.existing_pins = existing_pins or set()
        self.duplicates_found = 0

        self.filter_stats = {
            "total": 0,
            "passed": 0,
            "commercial": 0,
            "haram": 0,
            "low_saves": 0,
            "no_link": 0,
            "no_title": 0,
            "duplicates": 0
        }

    def fetch_page(self, bookmark=None):
        """Fetch one page of search results with retry logic"""
        source_url_param = f"/search/pins/?q={self.encoded_query}&rs=typed"

        options = {
            "applied_unified_filters": None,
            "appliedProductFilters": "---",
            "article": None,
            "auto_correction_disabled": False,
            "corpus": None,
            "customized_rerank_type": None,
            "domains": None,
            "filters": None,
            "journey_depth": None,
            "page_size": None,
            "price_max": None,
            "price_min": None,
            "query_pin_sigs": None,
            "query": self.query,
            "redux_normalize_feed": True,
            "request_params": None,
            "rs": "typed",
            "scope": "pins",
            "selected_one_bar_modules": None,
            "seoDrawerEnabled": False,
            "source_id": None,
            "source_module_id": None,
            "source_url": source_url_param,
            "top_pin_id": None,
            "top_pin_ids": None
        }

        payload = {"options": options.copy(), "context": {}}
        if bookmark:
            payload["options"]["bookmarks"] = [bookmark]

        max_retries = 3
        for attempt in range(max_retries):
            try:
                resp = self.session.get(PinterestScraperConfig.BASE_URL, params={
                    "source_url": options["source_url"],
                    "data": json.dumps(payload, separators=(",", ":")),
                    "_": str(int(time.time() * 1000))
                }, timeout=30)

                resp.raise_for_status()
                data = resp.json()

                results_count = len(data.get('resource_response', {}).get('data', {}).get('results', []))
                print(f"  Status: {resp.status_code}, Results: {results_count}")

                return data

            except requests.HTTPError as e:
                print(f"  HTTP error attempt {attempt + 1}/{max_retries}: {e}")
                if attempt < max_retries - 1 and resp.status_code in [429, 503]:
                    time.sleep(2 ** attempt)
                    continue
                return None
            except Exception as e:
                print(f"  Error attempt {attempt + 1}/{max_retries}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                return None

        return None

    def extract_pin_data(self, pin):
        """Extract and process pin data"""
        try:
            # Extract basic information
            pin_id = pin.get("id", "")
            if not pin_id:
                return None

            # Get title and description
            title = ""
            for field in ["title", "grid_title", "rich_summary", "display_name", "seo_title"]:
                if field in pin and pin[field]:
                    title = str(pin[field])
                    break

            description = ""
            for field in ["description", "seo_description", "alt_text", "grid_description"]:
                if field in pin and pin[field]:
                    description = str(pin[field])
                    break

            # Clean text
            title = clean_text(title, 200)
            description = clean_text(description, 500)

            # Skip if no title at all
            if not title or title.lower() == "untitled":
                self.filter_stats["no_title"] += 1
                return None

            # Combine text for keyword filtering
            combined_text = f"{title} {description}".lower()

            # Get image URL
            image_url = extract_image_url(pin)

            # Get link
            link = pin.get("link") or pin.get("destination_url") or pin.get("url") or ""

            # Get save count
            saves = extract_save_count(pin)

            # Get other stats
            comments = 0
            repins = 0

            comments_data = pin.get("comment_count", 0)
            if comments_data:
                comments = int(comments_data)
            else:
                aggregated = pin.get("aggregated_pin_data", {})
                if isinstance(aggregated, dict):
                    comments = aggregated.get("comment_count", 0)

            repins_data = pin.get("repin_count", 0)
            if repins_data:
                repins = int(repins_data)
            else:
                aggregated = pin.get("aggregated_pin_data", {})
                if isinstance(aggregated, dict):
                    repins = aggregated.get("repin_count", 0)

            # Get creator info
            creator = pin.get("creator") or pin.get("pinner") or {}
            creator_name = creator.get("full_name") or creator.get("username") or ""
            creator_username = creator.get("username") or ""

            # Get board info
            board = pin.get("board") or {}
            board_name = board.get("name") or ""

            # Get dates
            created_at = pin.get("created_at") or pin.get("date_published") or ""
            age_info = calculate_pin_age(created_at)

            # Extract domain
            domain = extract_domain(link)

            # Check filters
            is_commercial = is_commercial_link(link)
            has_banned_keywords = contains_banned_keywords(combined_text)
            has_halal_keywords = contains_halal_keywords(combined_text)

            # Create pin data dictionary
            pin_data = {
                "pin_id": pin_id,
                "title": title,
                "description": description,
                "image_url": image_url,
                "link": link,
                "domain": domain,
                "is_commercial": is_commercial,
                "has_banned_keywords": has_banned_keywords,
                "has_halal_keywords": has_halal_keywords,
                "saves": saves,
                "comments": comments,
                "repins": repins,
                "total_engagement": saves + comments + repins,
                "creator_name": creator_name,
                "creator_username": creator_username,
                "board_name": board_name,
                "created_at": created_at,
                "age_days": age_info["days"],
                "age_human": age_info["human_readable"],
                "pinterest_url": f"https://www.pinterest.com/pin/{pin_id}/",
                "scraped_at": datetime.now().isoformat()
            }

            return pin_data

        except Exception as e:
            # print(f"Error extracting pin: {e}")
            return None

    def validate_pin(self, pin_data):
        """Validate pin against halal and commercial filters"""
        if not pin_data:
            return False

        # Update filter statistics
        self.filter_stats["total"] += 1

        # Check each filter
        passed = True

        if not pin_data.get("link"):
            self.filter_stats["no_link"] += 1
            passed = False

        if pin_data.get("is_commercial", False):
            self.filter_stats["commercial"] += 1
            passed = False

        if pin_data.get("has_banned_keywords", False):
            self.filter_stats["haram"] += 1
            passed = False

        if pin_data.get("saves", 0) < 1:
            self.filter_stats["low_saves"] += 1
            passed = False

        if passed:
            self.filter_stats["passed"] += 1

        return passed

    def remove_duplicates(self):
        """Remove duplicates based on existing pins in Google Sheet"""
        print(f"\n🔍 Removing duplicates (checking against {len(self.existing_pins)} existing pins)...")

        self.unique_filtered_pins = []
        duplicate_count = 0

        for pin in self.filtered_pins:
            pin_id = pin.get("pin_id", "")

            # Check if this pin already exists in our Google Sheet
            if pin_id in self.existing_pins:
                duplicate_count += 1
                # print(f"  ✗ Duplicate found: {pin_id}")
            else:
                self.unique_filtered_pins.append(pin)

        self.filter_stats["duplicates"] = duplicate_count
        print(f"✅ Removed {duplicate_count} duplicates")
        print(f"✅ Unique new pins: {len(self.unique_filtered_pins)}")

        return self.unique_filtered_pins

    def scrape(self, pages_to_scrape):
        """Main scraping function"""
        print(f"\n🔍 Starting search for: '{self.query}'")
        print(f"🎯 Pages to scrape: {pages_to_scrape}")
        print(f"✅ Will check Google Sheet for duplicates")
        print("-" * 60)

        bookmark = None
        previous_bookmark = None

        for page in range(pages_to_scrape):
            print(f"\n📄 Page {page + 1}/{pages_to_scrape}")

            data = self.fetch_page(bookmark)
            if not data:
                print("  Failed to fetch page. Stopping.")
                break

            # Extract results
            resource_response = data.get("resource_response", {})
            results = resource_response.get("data", {}).get("results", [])

            print(f"  Found {len(results)} raw pins")

            # Process each pin
            pins_processed = 0
            pins_kept = 0

            for pin in results:
                pin_data = self.extract_pin_data(pin)
                if pin_data:
                    pins_processed += 1
                    self.all_pins.append(pin_data)

                    # Apply filters
                    if self.validate_pin(pin_data):
                        self.filtered_pins.append(pin_data)
                        pins_kept += 1

            print(f"  Processed: {pins_processed} | Kept after filtering: {pins_kept}")

            # Update bookmark for next page
            current_bookmark = resource_response.get("bookmark")
            if not current_bookmark or current_bookmark == previous_bookmark:
                print("  No new bookmark. Stopping.")
                break

            previous_bookmark = current_bookmark
            bookmark = current_bookmark

            # Add delay between pages
            if page < pages_to_scrape - 1:
                delay = random.uniform(2, 4)
                print(f"  Waiting {delay:.1f}s before next page...")
                time.sleep(delay)

        print(f"\n✅ Scraping complete!")
        print(f"   Total pins collected: {len(self.all_pins)}")
        print(f"   Filtered pins kept: {len(self.filtered_pins)}")

        # Remove duplicates
        if self.filtered_pins and self.existing_pins:
            self.remove_duplicates()
        else:
            self.unique_filtered_pins = self.filtered_pins.copy()

        # Show filter statistics
        print(f"\n📊 Filter Statistics:")
        print(f"   • Total pins processed: {self.filter_stats['total']}")
        print(f"   • Passed all filters: {self.filter_stats['passed']}")
        print(f"   • Commercial links: {self.filter_stats['commercial']}")
        print(f"   • Haram content: {self.filter_stats['haram']}")
        print(f"   • Low saves (<1): {self.filter_stats['low_saves']}")
        print(f"   • No link: {self.filter_stats['no_link']}")
        print(f"   • No title: {self.filter_stats['no_title']}")
        print(f"   • Duplicates found: {self.filter_stats['duplicates']}")
        print(f"   • Unique new pins: {len(self.unique_filtered_pins)}")

    def display_summary(self):
        """Display summary of collected data"""
        if not self.all_pins:
            print("\n❌ No pins collected at all!")
            return

        print("\n" + "="*60)
        print("📊 RESULTS SUMMARY")
        print("="*60)

        print(f"\n🔑 Keyword: {self.query}")
        print(f"📌 Total pins collected: {len(self.all_pins)}")
        print(f"✅ Filtered pins kept: {len(self.filtered_pins)}")
        print(f"🔄 Duplicates removed: {self.filter_stats['duplicates']}")
        print(f"🎯 Unique new pins: {len(self.unique_filtered_pins)}")

        # Show sample of unique new pins
        if self.unique_filtered_pins:
            print(f"\n📋 Sample of New Unique Pins (First 5):")
            for i, pin in enumerate(self.unique_filtered_pins[:5], 1):
                title = pin.get('title', 'No title')
                if len(title) > 50:
                    title = title[:47] + "..."

                saves = pin.get('saves', 0)
                domain = pin.get('domain', 'N/A')[:20]

                print(f"\n   {i:2d}. {title}")
                print(f"       Saves: {saves:>6,} | Domain: {domain}")

        print(f"\n" + "="*60)

    def save_filtered_results(self):
        """Save ONLY filtered and unique pins to CSV"""
        if not self.unique_filtered_pins:
            print("❌ No unique filtered pins to save!")
            return None

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_query = re.sub(r'[^\w\-_]', '_', self.query.lower())

        # Create descriptive filename
        filename = f"pinterest_{safe_query}_filtered_unique_{timestamp}.csv"

        # Define CSV fields for filtered results
        csv_fields = [
            'pin_id', 'title', 'description', 'pinterest_url', 'link', 'domain',
            'saves', 'comments', 'repins', 'total_engagement',
            'creator_name', 'creator_username', 'board_name',
            'created_at', 'age_human', 'age_days', 'image_url',
            'scraped_at', 'halal_friendly'
        ]

        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=csv_fields)
            writer.writeheader()

            for pin in self.unique_filtered_pins:
                row = {
                    'pin_id': pin.get('pin_id', ''),
                    'title': pin.get('title', ''),
                    'description': pin.get('description', ''),
                    'pinterest_url': pin.get('pinterest_url', ''),
                    'link': pin.get('link', ''),
                    'domain': pin.get('domain', ''),
                    'saves': pin.get('saves', 0),
                    'comments': pin.get('comments', 0),
                    'repins': pin.get('repins', 0),
                    'total_engagement': pin.get('total_engagement', 0),
                    'creator_name': pin.get('creator_name', ''),
                    'creator_username': pin.get('creator_username', ''),
                    'board_name': pin.get('board_name', ''),
                    'created_at': pin.get('created_at', ''),
                    'age_human': pin.get('age_human', ''),
                    'age_days': pin.get('age_days', 0),
                    'image_url': pin.get('image_url', ''),
                    'scraped_at': pin.get('scraped_at', ''),
                    'halal_friendly': 'Yes' if pin.get('has_halal_keywords') else 'No'
                }
                writer.writerow(row)

        print(f"\n💾 Saved {len(self.unique_filtered_pins)} unique filtered pins to: {filename}")

        # Also save a simple summary file
        summary_filename = f"pinterest_{safe_query}_summary_{timestamp}.txt"
        with open(summary_filename, 'w', encoding='utf-8') as f:
            f.write(f"Pinterest Scraping Summary\n")
            f.write("="*40 + "\n")
            f.write(f"Keyword: {self.query}\n")
            f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Total pins collected: {len(self.all_pins)}\n")
            f.write(f"Filtered pins kept: {len(self.filtered_pins)}\n")
            f.write(f"Duplicates removed: {self.filter_stats['duplicates']}\n")
            f.write(f"Unique new pins: {len(self.unique_filtered_pins)}\n")
            f.write("\nFilter Statistics:\n")
            f.write(f"  • Commercial links: {self.filter_stats['commercial']}\n")
            f.write(f"  • Haram content: {self.filter_stats['haram']}\n")
            f.write(f"  • Low saves (<1): {self.filter_stats['low_saves']}\n")
            f.write(f"  • No link: {self.filter_stats['no_link']}\n")

        print(f"📝 Saved summary to: {summary_filename}")

        return [filename, summary_filename]

# ----------------------------
# Main Execution
# ----------------------------
def main():
    print("\n" + "="*60)
    print("🎨 PINTEREST HALAL CONTENT SCRAPER")
    print("="*60)
    print("✅ Google Sheets duplicate checking")
    print("✅ Downloads ONLY filtered unique pins")
    print("="*60)

    # Setup Google Sheets
    gc = setup_google_sheets()

    # Get existing pins from Google Sheet
    existing_pins = get_existing_pins_from_sheet(gc, sheet_id, sheet_name)

    # Create scraper instance with existing pins
    scraper = PinterestHalalScraper(csrftoken, pinterest_sess, query, existing_pins)

    # Start scraping
    start_time = time.time()
    scraper.scrape(pages_to_scrape)
    elapsed_time = time.time() - start_time

    # Display summary
    scraper.display_summary()

    # Save and download ONLY filtered unique results
    if scraper.unique_filtered_pins:
        print(f"\n⏱️  Total time: {elapsed_time:.1f} seconds")

        print("\n💾 Saving filtered unique pins to CSV...")
        files_to_download = scraper.save_filtered_results()

        if files_to_download:
            print("\n📥 Downloading files from Google Colab...")
            for file in files_to_download:
                try:
                    files.download(file)
                    print(f"   Downloaded: {file}")
                except Exception as e:
                    print(f"   Could not download {file}: {e}")

            print("\n✅ FILES DOWNLOADED SUCCESSFULLY!")
            print(f"\n📊 Summary:")
            print(f"   • Original pins: {len(scraper.all_pins)}")
            print(f"   • After filtering: {len(scraper.filtered_pins)}")
            print(f"   • Duplicates removed: {scraper.filter_stats['duplicates']}")
            print(f"   • Final unique pins: {len(scraper.unique_filtered_pins)}")

            # Show first few pins as preview
            if scraper.unique_filtered_pins:
                print(f"\n🎯 First 3 unique pins:")
                for i, pin in enumerate(scraper.unique_filtered_pins[:3], 1):
                    title = pin.get('title', 'No title')[:60]
                    saves = pin.get('saves', 0)
                    print(f"   {i}. {title}... (Saves: {saves:,})")
        else:
            print("\n❌ No files to download.")
    else:
        print("\n❌ No unique filtered pins found after duplicate removal.")
        print("   All pins were either filtered out or already exist in your Google Sheet.")

    print("\n" + "="*60)
    print("✅ PROCESS COMPLETED")
    print("="*60)

# Run the main function
if __name__ == "__main__":
    main()