"""Pydantic models for FII data validation.

Defines the schema for all data types flowing through the system,
including the 6-factor scoring model (18 sub-factors A1–F3).

Full S&P 500 universe (503 stocks) + 20 major ETFs = 523 securities.
Tier system controls analysis depth per security.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ─── Enums ───

class Signal(str, Enum):
    BUY = "BUY"
    HOLD = "HOLD"
    SELL = "SELL"


class ScoreLabel(str, Enum):
    STRONG = "Strong"
    FAVORABLE = "Favorable"
    NEUTRAL = "Neutral"
    WEAK = "Weak"
    CAUTION = "Caution"


class Confidence(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


# ─── 6-Factor Model Constants ───

FACTOR_IDS = [
    "A1", "A2", "A3",  # Upstream Suppliers
    "B1", "B2", "B3",  # Downstream Customers
    "C1", "C2", "C3",  # Geopolitics
    "D1", "D2", "D3",  # Monetary
    "E1", "E2", "E3",  # Correlations
    "F1", "F2", "F3",  # Risk & Performance
]

FACTOR_NAMES = {
    "A1": "Operational Disruption",
    "A2": "Supplier Earnings Miss",
    "A3": "Lead Time Extensions",
    "B1": "CapEx Guidance Changes",
    "B2": "Contract Updates",
    "B3": "Customer Revenue Growth",
    "C1": "Physical Conflict",
    "C2": "Trade Barriers",
    "C3": "Logistics Disruption",
    "D1": "Fed Decisions",
    "D2": "CPI/Inflation",
    "D3": "10Y Treasury Yield",
    "E1": "Sector Peers",
    "E2": "Commodity Link",
    "E3": "Risk Sentiment",
    "F1": "EPS Surprise",
    "F2": "Guidance Revision",
    "F3": "Beta/Volatility",
}

# Category weights (sum to 0.80, normalized internally)
CATEGORY_WEIGHTS = {
    "micro_web": 0.25,       # A + B
    "macro_climate": 0.20,   # C + D
    "correlations": 0.20,    # E
    "risk_performance": 0.15, # F
}

CATEGORY_FACTOR_MAP = {
    "micro_web": ["A1", "A2", "A3", "B1", "B2", "B3"],
    "macro_climate": ["C1", "C2", "C3", "D1", "D2", "D3"],
    "correlations": ["E1", "E2", "E3"],
    "risk_performance": ["F1", "F2", "F3"],
}


# ─── Full S&P 500 Universe (503 stocks) + 20 ETFs ───
# Organized by GICS sector. Each entry: ticker -> (companyName, sector)

_SP500_DATA: dict[str, tuple[str, str]] = {
    # ─── Information Technology (76 stocks) ───
    "AAPL": ("Apple Inc.", "Information Technology"),
    "MSFT": ("Microsoft Corporation", "Information Technology"),
    "NVDA": ("NVIDIA Corporation", "Information Technology"),
    "AVGO": ("Broadcom Inc.", "Information Technology"),
    "CRM": ("Salesforce Inc.", "Information Technology"),
    "ADBE": ("Adobe Inc.", "Information Technology"),
    "AMD": ("Advanced Micro Devices", "Information Technology"),
    "CSCO": ("Cisco Systems Inc.", "Information Technology"),
    "ACN": ("Accenture plc", "Information Technology"),
    "ORCL": ("Oracle Corporation", "Information Technology"),
    "INTC": ("Intel Corporation", "Information Technology"),
    "IBM": ("International Business Machines", "Information Technology"),
    "INTU": ("Intuit Inc.", "Information Technology"),
    "NOW": ("ServiceNow Inc.", "Information Technology"),
    "TXN": ("Texas Instruments Inc.", "Information Technology"),
    "QCOM": ("Qualcomm Inc.", "Information Technology"),
    "AMAT": ("Applied Materials Inc.", "Information Technology"),
    "MU": ("Micron Technology Inc.", "Information Technology"),
    "PANW": ("Palo Alto Networks Inc.", "Information Technology"),
    "SNPS": ("Synopsys Inc.", "Information Technology"),
    "LRCX": ("Lam Research Corporation", "Information Technology"),
    "KLAC": ("KLA Corporation", "Information Technology"),
    "CDNS": ("Cadence Design Systems", "Information Technology"),
    "ADSK": ("Autodesk Inc.", "Information Technology"),
    "CRWD": ("CrowdStrike Holdings", "Information Technology"),
    "FTNT": ("Fortinet Inc.", "Information Technology"),
    "APH": ("Amphenol Corporation", "Information Technology"),
    "MSI": ("Motorola Solutions Inc.", "Information Technology"),
    "MCHP": ("Microchip Technology", "Information Technology"),
    "NXPI": ("NXP Semiconductors", "Information Technology"),
    "ON": ("ON Semiconductor", "Information Technology"),
    "ROP": ("Roper Technologies", "Information Technology"),
    "IT": ("Gartner Inc.", "Information Technology"),
    "CDW": ("CDW Corporation", "Information Technology"),
    "MPWR": ("Monolithic Power Systems", "Information Technology"),
    "KEYS": ("Keysight Technologies", "Information Technology"),
    "ANSS": ("ANSYS Inc.", "Information Technology"),
    "HPQ": ("HP Inc.", "Information Technology"),
    "HPE": ("Hewlett Packard Enterprise", "Information Technology"),
    "GLW": ("Corning Inc.", "Information Technology"),
    "TDY": ("Teledyne Technologies", "Information Technology"),
    "ZBRA": ("Zebra Technologies", "Information Technology"),
    "TRMB": ("Trimble Inc.", "Information Technology"),
    "PTC": ("PTC Inc.", "Information Technology"),
    "VRSN": ("VeriSign Inc.", "Information Technology"),
    "TYL": ("Tyler Technologies", "Information Technology"),
    "SWKS": ("Skyworks Solutions", "Information Technology"),
    "FSLR": ("First Solar Inc.", "Information Technology"),
    "GEN": ("Gen Digital Inc.", "Information Technology"),
    "JNPR": ("Juniper Networks", "Information Technology"),
    "EPAM": ("EPAM Systems Inc.", "Information Technology"),
    "FFIV": ("F5 Inc.", "Information Technology"),
    "QRVO": ("Qorvo Inc.", "Information Technology"),
    "ENPH": ("Enphase Energy Inc.", "Information Technology"),
    "SEDG": ("SolarEdge Technologies", "Information Technology"),
    "AKAM": ("Akamai Technologies", "Information Technology"),
    "NTAP": ("NetApp Inc.", "Information Technology"),
    "WDC": ("Western Digital", "Information Technology"),
    "STX": ("Seagate Technology", "Information Technology"),
    "SMCI": ("Super Micro Computer", "Information Technology"),
    "DELL": ("Dell Technologies", "Information Technology"),
    "PLTR": ("Palantir Technologies", "Information Technology"),
    "GDDY": ("GoDaddy Inc.", "Information Technology"),
    "FICO": ("Fair Isaac Corporation", "Information Technology"),
    "MANH": ("Manhattan Associates", "Information Technology"),
    "CTSH": ("Cognizant Technology", "Information Technology"),
    "WDAY": ("Workday Inc.", "Information Technology"),
    "DDOG": ("Datadog Inc.", "Information Technology"),
    "TEAM": ("Atlassian Corporation", "Information Technology"),
    "HUBS": ("HubSpot Inc.", "Information Technology"),
    "SNAP": ("Snap Inc.", "Information Technology"),
    "ZS": ("Zscaler Inc.", "Information Technology"),
    "MSTR": ("MicroStrategy Inc.", "Information Technology"),
    "APP": ("AppLovin Corporation", "Information Technology"),
    "ANET": ("Arista Networks", "Information Technology"),
    "ABNB": ("Airbnb Inc.", "Consumer Discretionary"),
    # ─── Communication Services (26 stocks) ───
    "GOOGL": ("Alphabet Inc. Class A", "Communication Services"),
    "GOOG": ("Alphabet Inc. Class C", "Communication Services"),
    "META": ("Meta Platforms Inc.", "Communication Services"),
    "NFLX": ("Netflix Inc.", "Communication Services"),
    "DIS": ("The Walt Disney Company", "Communication Services"),
    "CMCSA": ("Comcast Corporation", "Communication Services"),
    "TMUS": ("T-Mobile US Inc.", "Communication Services"),
    "VZ": ("Verizon Communications Inc.", "Communication Services"),
    "T": ("AT&T Inc.", "Communication Services"),
    "EA": ("Electronic Arts Inc.", "Communication Services"),
    "CHTR": ("Charter Communications", "Communication Services"),
    "WBD": ("Warner Bros. Discovery", "Communication Services"),
    "OMC": ("Omnicom Group", "Communication Services"),
    "IPG": ("Interpublic Group", "Communication Services"),
    "TTWO": ("Take-Two Interactive", "Communication Services"),
    "LYV": ("Live Nation Entertainment", "Communication Services"),
    "MTCH": ("Match Group Inc.", "Communication Services"),
    "PARA": ("Paramount Global", "Communication Services"),
    "FOXA": ("Fox Corporation Class A", "Communication Services"),
    "FOX": ("Fox Corporation Class B", "Communication Services"),
    "NWSA": ("News Corp Class A", "Communication Services"),
    "NWS": ("News Corp Class B", "Communication Services"),
    "PINS": ("Pinterest Inc.", "Communication Services"),
    "RBLX": ("Roblox Corporation", "Communication Services"),
    "SPOT": ("Spotify Technology", "Communication Services"),
    "UBER": ("Uber Technologies", "Communication Services"),
    # ─── Consumer Discretionary (57 stocks) ───
    "AMZN": ("Amazon.com Inc.", "Consumer Discretionary"),
    "TSLA": ("Tesla Inc.", "Consumer Discretionary"),
    "HD": ("The Home Depot Inc.", "Consumer Discretionary"),
    "MCD": ("McDonald's Corporation", "Consumer Discretionary"),
    "NKE": ("NIKE Inc.", "Consumer Discretionary"),
    "LOW": ("Lowe's Companies Inc.", "Consumer Discretionary"),
    "SBUX": ("Starbucks Corporation", "Consumer Discretionary"),
    "TJX": ("The TJX Companies Inc.", "Consumer Discretionary"),
    "BKNG": ("Booking Holdings Inc.", "Consumer Discretionary"),
    "CMG": ("Chipotle Mexican Grill", "Consumer Discretionary"),
    "ORLY": ("O'Reilly Automotive", "Consumer Discretionary"),
    "AZO": ("AutoZone Inc.", "Consumer Discretionary"),
    "MAR": ("Marriott International", "Consumer Discretionary"),
    "HLT": ("Hilton Worldwide", "Consumer Discretionary"),
    "ROST": ("Ross Stores Inc.", "Consumer Discretionary"),
    "GM": ("General Motors Company", "Consumer Discretionary"),
    "F": ("Ford Motor Company", "Consumer Discretionary"),
    "DHI": ("D.R. Horton Inc.", "Consumer Discretionary"),
    "LEN": ("Lennar Corporation", "Consumer Discretionary"),
    "NVR": ("NVR Inc.", "Consumer Discretionary"),
    "PHM": ("PulteGroup Inc.", "Consumer Discretionary"),
    "YUM": ("Yum! Brands Inc.", "Consumer Discretionary"),
    "DPZ": ("Domino's Pizza Inc.", "Consumer Discretionary"),
    "DKNG": ("DraftKings Inc.", "Consumer Discretionary"),
    "RCL": ("Royal Caribbean Cruises", "Consumer Discretionary"),
    "CCL": ("Carnival Corporation", "Consumer Discretionary"),
    "EXPE": ("Expedia Group", "Consumer Discretionary"),
    "LVS": ("Las Vegas Sands", "Consumer Discretionary"),
    "WYNN": ("Wynn Resorts", "Consumer Discretionary"),
    "MGM": ("MGM Resorts International", "Consumer Discretionary"),
    "DRI": ("Darden Restaurants", "Consumer Discretionary"),
    "APTV": ("Aptiv PLC", "Consumer Discretionary"),
    "POOL": ("Pool Corporation", "Consumer Discretionary"),
    "BBY": ("Best Buy Co. Inc.", "Consumer Discretionary"),
    "ULTA": ("Ulta Beauty Inc.", "Consumer Discretionary"),
    "EBAY": ("eBay Inc.", "Consumer Discretionary"),
    "GRMN": ("Garmin Ltd.", "Consumer Discretionary"),
    "TSCO": ("Tractor Supply Company", "Consumer Discretionary"),
    "KMX": ("CarMax Inc.", "Consumer Discretionary"),
    "GPC": ("Genuine Parts Company", "Consumer Discretionary"),
    "ETSY": ("Etsy Inc.", "Consumer Discretionary"),
    "BWA": ("BorgWarner Inc.", "Consumer Discretionary"),
    "CZR": ("Caesars Entertainment", "Consumer Discretionary"),
    "DECK": ("Deckers Outdoor", "Consumer Discretionary"),
    "LULU": ("Lululemon Athletica", "Consumer Discretionary"),
    "TPR": ("Tapestry Inc.", "Consumer Discretionary"),
    "RL": ("Ralph Lauren Corporation", "Consumer Discretionary"),
    "HAS": ("Hasbro Inc.", "Consumer Discretionary"),
    "MHK": ("Mohawk Industries", "Consumer Discretionary"),
    "WHR": ("Whirlpool Corporation", "Consumer Discretionary"),
    "WSM": ("Williams-Sonoma Inc.", "Consumer Discretionary"),
    "DASH": ("DoorDash Inc.", "Consumer Discretionary"),
    "CPRT": ("Copart Inc.", "Consumer Discretionary"),
    "CASY": ("Casey's General Stores", "Consumer Discretionary"),
    "LKQ": ("LKQ Corporation", "Consumer Discretionary"),
    "NCLH": ("Norwegian Cruise Line", "Consumer Discretionary"),
    "TKO": ("TKO Group Holdings", "Consumer Discretionary"),
    # ─── Financials (74 stocks) ───
    "JPM": ("JPMorgan Chase & Co.", "Financials"),
    "V": ("Visa Inc.", "Financials"),
    "MA": ("Mastercard Inc.", "Financials"),
    "BAC": ("Bank of America Corporation", "Financials"),
    "WFC": ("Wells Fargo & Company", "Financials"),
    "GS": ("The Goldman Sachs Group", "Financials"),
    "MS": ("Morgan Stanley", "Financials"),
    "BLK": ("BlackRock Inc.", "Financials"),
    "SCHW": ("Charles Schwab Corporation", "Financials"),
    "AXP": ("American Express Company", "Financials"),
    "PYPL": ("PayPal Holdings Inc.", "Financials"),
    "SQ": ("Block Inc.", "Financials"),
    "BRK.B": ("Berkshire Hathaway Inc.", "Financials"),
    "SPGI": ("S&P Global Inc.", "Financials"),
    "CB": ("Chubb Limited", "Financials"),
    "MMC": ("Marsh & McLennan", "Financials"),
    "PGR": ("Progressive Corporation", "Financials"),
    "ICE": ("Intercontinental Exchange", "Financials"),
    "AON": ("Aon plc", "Financials"),
    "CME": ("CME Group Inc.", "Financials"),
    "MCO": ("Moody's Corporation", "Financials"),
    "USB": ("U.S. Bancorp", "Financials"),
    "AIG": ("American International Group", "Financials"),
    "PNC": ("PNC Financial Services", "Financials"),
    "TFC": ("Truist Financial", "Financials"),
    "COF": ("Capital One Financial", "Financials"),
    "MET": ("MetLife Inc.", "Financials"),
    "ALL": ("The Allstate Corporation", "Financials"),
    "AJG": ("Arthur J. Gallagher", "Financials"),
    "TRV": ("The Travelers Companies", "Financials"),
    "AFL": ("Aflac Inc.", "Financials"),
    "PRU": ("Prudential Financial", "Financials"),
    "MSCI": ("MSCI Inc.", "Financials"),
    "FIS": ("Fidelity National Information", "Financials"),
    "FITB": ("Fifth Third Bancorp", "Financials"),
    "MTB": ("M&T Bank Corporation", "Financials"),
    "DFS": ("Discover Financial Services", "Financials"),
    "HBAN": ("Huntington Bancshares", "Financials"),
    "BK": ("The Bank of New York Mellon", "Financials"),
    "STT": ("State Street Corporation", "Financials"),
    "RF": ("Regions Financial", "Financials"),
    "CFG": ("Citizens Financial Group", "Financials"),
    "KEY": ("KeyCorp", "Financials"),
    "NTRS": ("Northern Trust", "Financials"),
    "SYF": ("Synchrony Financial", "Financials"),
    "CINF": ("Cincinnati Financial", "Financials"),
    "TROW": ("T. Rowe Price Group", "Financials"),
    "WRB": ("W. R. Berkley Corporation", "Financials"),
    "RJF": ("Raymond James Financial", "Financials"),
    "L": ("Loews Corporation", "Financials"),
    "RE": ("Everest Group Ltd.", "Financials"),
    "BRO": ("Brown & Brown Inc.", "Financials"),
    "FDS": ("FactSet Research Systems", "Financials"),
    "MKTX": ("MarketAxess Holdings", "Financials"),
    "CBOE": ("Cboe Global Markets", "Financials"),
    "NDAQ": ("Nasdaq Inc.", "Financials"),
    "IVZ": ("Invesco Ltd.", "Financials"),
    "BEN": ("Franklin Resources", "Financials"),
    "GL": ("Globe Life Inc.", "Financials"),
    "AIZ": ("Assurant Inc.", "Financials"),
    "HOOD": ("Robinhood Markets", "Financials"),
    "ARES": ("Ares Management", "Financials"),
    "FI": ("Fiserv Inc.", "Financials"),
    "GPN": ("Global Payments Inc.", "Financials"),
    "WTW": ("Willis Towers Watson", "Financials"),
    "ACGL": ("Arch Capital Group", "Financials"),
    "HIG": ("The Hartford Financial", "Financials"),
    "EG": ("Everest Group", "Financials"),
    "ERIE": ("Erie Indemnity Company", "Financials"),
    "JKHY": ("Jack Henry & Associates", "Financials"),
    "EWBC": ("East West Bancorp", "Financials"),
    "ZION": ("Zions Bancorporation", "Financials"),
    "CMA": ("Comerica Inc.", "Financials"),
    "ALLY": ("Ally Financial", "Financials"),
    "WAL": ("Western Alliance Bancorp", "Financials"),
    # ─── Health Care (64 stocks) ───
    "UNH": ("UnitedHealth Group Inc.", "Health Care"),
    "JNJ": ("Johnson & Johnson", "Health Care"),
    "LLY": ("Eli Lilly and Company", "Health Care"),
    "ABBV": ("AbbVie Inc.", "Health Care"),
    "PFE": ("Pfizer Inc.", "Health Care"),
    "MRK": ("Merck & Co. Inc.", "Health Care"),
    "TMO": ("Thermo Fisher Scientific", "Health Care"),
    "ABT": ("Abbott Laboratories", "Health Care"),
    "DHR": ("Danaher Corporation", "Health Care"),
    "BMY": ("Bristol-Myers Squibb", "Health Care"),
    "AMGN": ("Amgen Inc.", "Health Care"),
    "GILD": ("Gilead Sciences Inc.", "Health Care"),
    "ISRG": ("Intuitive Surgical Inc.", "Health Care"),
    "ELV": ("Elevance Health Inc.", "Health Care"),
    "CI": ("The Cigna Group", "Health Care"),
    "VRTX": ("Vertex Pharmaceuticals", "Health Care"),
    "REGN": ("Regeneron Pharmaceuticals", "Health Care"),
    "SYK": ("Stryker Corporation", "Health Care"),
    "BSX": ("Boston Scientific", "Health Care"),
    "MDT": ("Medtronic plc", "Health Care"),
    "ZTS": ("Zoetis Inc.", "Health Care"),
    "BDX": ("Becton Dickinson", "Health Care"),
    "EW": ("Edwards Lifesciences", "Health Care"),
    "A": ("Agilent Technologies", "Health Care"),
    "HCA": ("HCA Healthcare", "Health Care"),
    "IQV": ("IQVIA Holdings", "Health Care"),
    "MCK": ("McKesson Corporation", "Health Care"),
    "CAH": ("Cardinal Health", "Health Care"),
    "COR": ("Cencora Inc.", "Health Care"),
    "IDXX": ("IDEXX Laboratories", "Health Care"),
    "MTD": ("Mettler-Toledo International", "Health Care"),
    "DXCM": ("DexCom Inc.", "Health Care"),
    "RMD": ("ResMed Inc.", "Health Care"),
    "WST": ("West Pharmaceutical", "Health Care"),
    "ALGN": ("Align Technology", "Health Care"),
    "HOLX": ("Hologic Inc.", "Health Care"),
    "TFX": ("Teleflex Inc.", "Health Care"),
    "PODD": ("Insulet Corporation", "Health Care"),
    "BAX": ("Baxter International", "Health Care"),
    "BIIB": ("Biogen Inc.", "Health Care"),
    "MRNA": ("Moderna Inc.", "Health Care"),
    "GEHC": ("GE HealthCare Technologies", "Health Care"),
    "VTRS": ("Viatris Inc.", "Health Care"),
    "TECH": ("Bio-Techne Corporation", "Health Care"),
    "INCY": ("Incyte Corporation", "Health Care"),
    "ILMN": ("Illumina Inc.", "Health Care"),
    "MOH": ("Molina Healthcare", "Health Care"),
    "CNC": ("Centene Corporation", "Health Care"),
    "HUM": ("Humana Inc.", "Health Care"),
    "HSIC": ("Henry Schein Inc.", "Health Care"),
    "XRAY": ("DENTSPLY SIRONA", "Health Care"),
    "DVA": ("DaVita Inc.", "Health Care"),
    "LH": ("Labcorp Holdings", "Health Care"),
    "DGX": ("Quest Diagnostics", "Health Care"),
    "CTLT": ("Catalent Inc.", "Health Care"),
    "CRL": ("Charles River Laboratories", "Health Care"),
    "BIO": ("Bio-Rad Laboratories", "Health Care"),
    "RVTY": ("Revvity Inc.", "Health Care"),
    "SOLV": ("Solventum Corporation", "Health Care"),
    "STE": ("STERIS plc", "Health Care"),
    "COO": ("CooperCompanies", "Health Care"),
    "SWAV": ("Shockwave Medical", "Health Care"),
    "PCVX": ("Vaxcyte Inc.", "Health Care"),
    "VEEV": ("Veeva Systems", "Health Care"),
    # ─── Energy (23 stocks) ───
    "XOM": ("Exxon Mobil Corporation", "Energy"),
    "CVX": ("Chevron Corporation", "Energy"),
    "COP": ("ConocoPhillips", "Energy"),
    "SLB": ("Schlumberger Limited", "Energy"),
    "EOG": ("EOG Resources Inc.", "Energy"),
    "MPC": ("Marathon Petroleum Corp.", "Energy"),
    "PSX": ("Phillips 66", "Energy"),
    "PXD": ("Pioneer Natural Resources", "Energy"),
    "VLO": ("Valero Energy Corp.", "Energy"),
    "OXY": ("Occidental Petroleum", "Energy"),
    "WMB": ("Williams Companies", "Energy"),
    "KMI": ("Kinder Morgan Inc.", "Energy"),
    "HAL": ("Halliburton Company", "Energy"),
    "DVN": ("Devon Energy Corp.", "Energy"),
    "FANG": ("Diamondback Energy", "Energy"),
    "BKR": ("Baker Hughes Company", "Energy"),
    "TRGP": ("Targa Resources Corp.", "Energy"),
    "OKE": ("ONEOK Inc.", "Energy"),
    "HES": ("Hess Corporation", "Energy"),
    "CTRA": ("Coterra Energy", "Energy"),
    "EQT": ("EQT Corporation", "Energy"),
    "APA": ("APA Corporation", "Energy"),
    "EXE": ("Expand Energy", "Energy"),
    # ─── Industrials (78 stocks) ───
    "CAT": ("Caterpillar Inc.", "Industrials"),
    "GE": ("GE Aerospace", "Industrials"),
    "HON": ("Honeywell International", "Industrials"),
    "UPS": ("United Parcel Service", "Industrials"),
    "RTX": ("RTX Corporation", "Industrials"),
    "BA": ("The Boeing Company", "Industrials"),
    "LMT": ("Lockheed Martin Corporation", "Industrials"),
    "DE": ("Deere & Company", "Industrials"),
    "UNP": ("Union Pacific Corporation", "Industrials"),
    "GD": ("General Dynamics Corporation", "Industrials"),
    "NOC": ("Northrop Grumman Corporation", "Industrials"),
    "ADP": ("Automatic Data Processing", "Industrials"),
    "ETN": ("Eaton Corporation", "Industrials"),
    "ITW": ("Illinois Tool Works", "Industrials"),
    "WM": ("Waste Management Inc.", "Industrials"),
    "EMR": ("Emerson Electric", "Industrials"),
    "FDX": ("FedEx Corporation", "Industrials"),
    "CSX": ("CSX Corporation", "Industrials"),
    "NSC": ("Norfolk Southern", "Industrials"),
    "JCI": ("Johnson Controls", "Industrials"),
    "TT": ("Trane Technologies", "Industrials"),
    "PH": ("Parker-Hannifin", "Industrials"),
    "CARR": ("Carrier Global", "Industrials"),
    "CTAS": ("Cintas Corporation", "Industrials"),
    "PCAR": ("PACCAR Inc.", "Industrials"),
    "AME": ("AMETEK Inc.", "Industrials"),
    "FAST": ("Fastenal Company", "Industrials"),
    "VRSK": ("Verisk Analytics", "Industrials"),
    "GWW": ("W.W. Grainger", "Industrials"),
    "ROK": ("Rockwell Automation", "Industrials"),
    "OTIS": ("Otis Worldwide", "Industrials"),
    "IR": ("Ingersoll Rand", "Industrials"),
    "DOV": ("Dover Corporation", "Industrials"),
    "AXON": ("Axon Enterprise", "Industrials"),
    "PAYX": ("Paychex Inc.", "Industrials"),
    "HWM": ("Howmet Aerospace", "Industrials"),
    "WAB": ("Westinghouse Air Brake", "Industrials"),
    "CPAY": ("Corpay Inc.", "Industrials"),
    "RSG": ("Republic Services", "Industrials"),
    "XYL": ("Xylem Inc.", "Industrials"),
    "HUBB": ("Hubbell Inc.", "Industrials"),
    "IEX": ("IDEX Corporation", "Industrials"),
    "SWK": ("Stanley Black & Decker", "Industrials"),
    "J": ("Jacobs Solutions", "Industrials"),
    "PWR": ("Quanta Services", "Industrials"),
    "TXT": ("Textron Inc.", "Industrials"),
    "LDOS": ("Leidos Holdings", "Industrials"),
    "LHX": ("L3Harris Technologies", "Industrials"),
    "HII": ("Huntington Ingalls", "Industrials"),
    "NDSN": ("Nordson Corporation", "Industrials"),
    "EME": ("EMCOR Group", "Industrials"),
    "RHI": ("Robert Half International", "Industrials"),
    "EFX": ("Equifax Inc.", "Industrials"),
    "BR": ("Broadridge Financial", "Industrials"),
    "DAL": ("Delta Air Lines", "Industrials"),
    "UAL": ("United Airlines Holdings", "Industrials"),
    "LUV": ("Southwest Airlines", "Industrials"),
    "BLDR": ("Builders FirstSource", "Industrials"),
    "DAY": ("Dayforce Inc.", "Industrials"),
    "ACM": ("AECOM", "Industrials"),
    "MAS": ("Masco Corporation", "Industrials"),
    "GNRC": ("Generac Holdings", "Industrials"),
    "ALLE": ("Allegion plc", "Industrials"),
    "AOS": ("A. O. Smith Corporation", "Industrials"),
    "SNA": ("Snap-on Inc.", "Industrials"),
    "JBHT": ("J.B. Hunt Transport", "Industrials"),
    "CHRW": ("C.H. Robinson Worldwide", "Industrials"),
    "EXPD": ("Expeditors International", "Industrials"),
    "PAYC": ("Paycom Software", "Industrials"),
    "FTV": ("Fortive Corporation", "Industrials"),
    "VLTO": ("Veralto Corporation", "Industrials"),
    "BALL": ("Ball Corporation", "Industrials"),
    "GEV": ("GE Vernova", "Industrials"),
    "KVUE": ("Kenvue Inc.", "Industrials"),
    "WSO": ("Watsco Inc.", "Industrials"),
    "WCC": ("WESCO International", "Industrials"),
    "RRX": ("Regal Rexnord", "Industrials"),
    "BWXT": ("BWX Technologies", "Industrials"),
    "TTEK": ("Tetra Tech Inc.", "Industrials"),
    "AAL": ("American Airlines Group", "Industrials"),
    # ─── Consumer Staples (39 stocks) ───
    "PG": ("The Procter & Gamble Company", "Consumer Staples"),
    "KO": ("The Coca-Cola Company", "Consumer Staples"),
    "PEP": ("PepsiCo Inc.", "Consumer Staples"),
    "COST": ("Costco Wholesale Corporation", "Consumer Staples"),
    "WMT": ("Walmart Inc.", "Consumer Staples"),
    "PM": ("Philip Morris International", "Consumer Staples"),
    "CL": ("Colgate-Palmolive Company", "Consumer Staples"),
    "MDLZ": ("Mondelez International", "Consumer Staples"),
    "MO": ("Altria Group Inc.", "Consumer Staples"),
    "KR": ("The Kroger Co.", "Consumer Staples"),
    "SYY": ("Sysco Corporation", "Consumer Staples"),
    "GIS": ("General Mills Inc.", "Consumer Staples"),
    "HSY": ("The Hershey Company", "Consumer Staples"),
    "K": ("Kellanova", "Consumer Staples"),
    "KDP": ("Keurig Dr Pepper", "Consumer Staples"),
    "STZ": ("Constellation Brands", "Consumer Staples"),
    "ADM": ("Archer-Daniels-Midland", "Consumer Staples"),
    "MNST": ("Monster Beverage Corp.", "Consumer Staples"),
    "KHC": ("The Kraft Heinz Company", "Consumer Staples"),
    "EL": ("The Estee Lauder Companies", "Consumer Staples"),
    "CLX": ("The Clorox Company", "Consumer Staples"),
    "SJM": ("The J.M. Smucker Company", "Consumer Staples"),
    "MKC": ("McCormick & Company", "Consumer Staples"),
    "CAG": ("Conagra Brands", "Consumer Staples"),
    "CPB": ("Campbell Soup Company", "Consumer Staples"),
    "HRL": ("Hormel Foods Corporation", "Consumer Staples"),
    "TAP": ("Molson Coors Beverage", "Consumer Staples"),
    "BG": ("Bunge Global SA", "Consumer Staples"),
    "TSN": ("Tyson Foods Inc.", "Consumer Staples"),
    "LW": ("Lamb Weston Holdings", "Consumer Staples"),
    "WBA": ("Walgreens Boots Alliance", "Consumer Staples"),
    "TGT": ("Target Corporation", "Consumer Staples"),
    "DG": ("Dollar General", "Consumer Staples"),
    "DLTR": ("Dollar Tree Inc.", "Consumer Staples"),
    "CHD": ("Church & Dwight", "Consumer Staples"),
    "KVUE2": ("Kenvue Inc.", "Consumer Staples"),
    "BF.B": ("Brown-Forman Corporation", "Consumer Staples"),
    "FDP": ("Fresh Del Monte Produce", "Consumer Staples"),
    "USFD": ("US Foods Holding", "Consumer Staples"),
    # ─── Utilities (31 stocks) ───
    "NEE": ("NextEra Energy Inc.", "Utilities"),
    "DUK": ("Duke Energy Corporation", "Utilities"),
    "SO": ("The Southern Company", "Utilities"),
    "AEP": ("American Electric Power", "Utilities"),
    "D": ("Dominion Energy Inc.", "Utilities"),
    "SRE": ("Sempra", "Utilities"),
    "EXC": ("Exelon Corporation", "Utilities"),
    "XEL": ("Xcel Energy Inc.", "Utilities"),
    "ED": ("Consolidated Edison", "Utilities"),
    "PEG": ("Public Service Enterprise", "Utilities"),
    "WEC": ("WEC Energy Group", "Utilities"),
    "EIX": ("Edison International", "Utilities"),
    "AWK": ("American Water Works", "Utilities"),
    "DTE": ("DTE Energy Company", "Utilities"),
    "ETR": ("Entergy Corporation", "Utilities"),
    "ES": ("Eversource Energy", "Utilities"),
    "FE": ("FirstEnergy Corp.", "Utilities"),
    "PPL": ("PPL Corporation", "Utilities"),
    "AEE": ("Ameren Corporation", "Utilities"),
    "CMS": ("CMS Energy Corporation", "Utilities"),
    "CNP": ("CenterPoint Energy", "Utilities"),
    "ATO": ("Atmos Energy Corp.", "Utilities"),
    "NI": ("NiSource Inc.", "Utilities"),
    "EVRG": ("Evergy Inc.", "Utilities"),
    "LNT": ("Alliant Energy", "Utilities"),
    "PNW": ("Pinnacle West Capital", "Utilities"),
    "NRG": ("NRG Energy Inc.", "Utilities"),
    "CEG": ("Constellation Energy", "Utilities"),
    "VST": ("Vistra Corp.", "Utilities"),
    "PCG": ("PG&E Corporation", "Utilities"),
    "BKH": ("Black Hills Corporation", "Utilities"),
    # ─── Real Estate (31 stocks) ───
    "PLD": ("Prologis Inc.", "Real Estate"),
    "AMT": ("American Tower Corporation", "Real Estate"),
    "CCI": ("Crown Castle Inc.", "Real Estate"),
    "EQIX": ("Equinix Inc.", "Real Estate"),
    "PSA": ("Public Storage", "Real Estate"),
    "SPG": ("Simon Property Group", "Real Estate"),
    "WELL": ("Welltower Inc.", "Real Estate"),
    "DLR": ("Digital Realty Trust", "Real Estate"),
    "O": ("Realty Income Corporation", "Real Estate"),
    "VICI": ("VICI Properties", "Real Estate"),
    "SBAC": ("SBA Communications", "Real Estate"),
    "IRM": ("Iron Mountain Inc.", "Real Estate"),
    "ARE": ("Alexandria Real Estate", "Real Estate"),
    "AVB": ("AvalonBay Communities", "Real Estate"),
    "EQR": ("Equity Residential", "Real Estate"),
    "MAA": ("Mid-America Apartment", "Real Estate"),
    "ESS": ("Essex Property Trust", "Real Estate"),
    "UDR": ("UDR Inc.", "Real Estate"),
    "VTR": ("Ventas Inc.", "Real Estate"),
    "HST": ("Host Hotels & Resorts", "Real Estate"),
    "KIM": ("Kimco Realty", "Real Estate"),
    "REG": ("Regency Centers", "Real Estate"),
    "CPT": ("Camden Property Trust", "Real Estate"),
    "INVH": ("Invitation Homes", "Real Estate"),
    "BXP": ("BXP Inc.", "Real Estate"),
    "DOC": ("Healthpeak Properties", "Real Estate"),
    "CBRE": ("CBRE Group Inc.", "Real Estate"),
    "FRT": ("Federal Realty Investment", "Real Estate"),
    "PEAK": ("Healthpeak Properties", "Real Estate"),
    "WY": ("Weyerhaeuser Company", "Real Estate"),
    "GLPI": ("Gaming & Leisure Properties", "Real Estate"),
    # ─── Materials (27 stocks) ───
    "LIN": ("Linde plc", "Materials"),
    "APD": ("Air Products and Chemicals", "Materials"),
    "SHW": ("The Sherwin-Williams Company", "Materials"),
    "FCX": ("Freeport-McMoRan Inc.", "Materials"),
    "NEM": ("Newmont Corporation", "Materials"),
    "ECL": ("Ecolab Inc.", "Materials"),
    "DD": ("DuPont de Nemours", "Materials"),
    "NUE": ("Nucor Corporation", "Materials"),
    "VMC": ("Vulcan Materials", "Materials"),
    "MLM": ("Martin Marietta Materials", "Materials"),
    "DOW": ("Dow Inc.", "Materials"),
    "PPG": ("PPG Industries", "Materials"),
    "CTVA": ("Corteva Inc.", "Materials"),
    "IFF": ("International Flavors", "Materials"),
    "EMN": ("Eastman Chemical", "Materials"),
    "ALB": ("Albemarle Corporation", "Materials"),
    "CE": ("Celanese Corporation", "Materials"),
    "CF": ("CF Industries Holdings", "Materials"),
    "MOS": ("The Mosaic Company", "Materials"),
    "IP": ("International Paper", "Materials"),
    "PKG": ("Packaging Corp of America", "Materials"),
    "AVY": ("Avery Dennison", "Materials"),
    "SEE": ("Sealed Air Corporation", "Materials"),
    "BALL2": ("Ball Corporation", "Materials"),
    "WRK": ("WestRock Company", "Materials"),
    "AMCR": ("Amcor plc", "Materials"),
    "RPM": ("RPM International", "Materials"),
}

# ─── 20 Major ETFs ───
_ETF_DATA: dict[str, tuple[str, str]] = {
    "SPY": ("SPDR S&P 500 ETF Trust", "ETF"),
    "QQQ": ("Invesco QQQ Trust", "ETF"),
    "DIA": ("SPDR Dow Jones Industrial Avg ETF", "ETF"),
    "IWM": ("iShares Russell 2000 ETF", "ETF"),
    "VTI": ("Vanguard Total Stock Market ETF", "ETF"),
    "VOO": ("Vanguard S&P 500 ETF", "ETF"),
    "IVV": ("iShares Core S&P 500 ETF", "ETF"),
    "VTV": ("Vanguard Value ETF", "ETF"),
    "VUG": ("Vanguard Growth ETF", "ETF"),
    "ARKK": ("ARK Innovation ETF", "ETF"),
    "XLK": ("Technology Select Sector SPDR", "ETF"),
    "XLF": ("Financial Select Sector SPDR", "ETF"),
    "XLE": ("Energy Select Sector SPDR", "ETF"),
    "XLV": ("Health Care Select Sector SPDR", "ETF"),
    "XLI": ("Industrial Select Sector SPDR", "ETF"),
    "XLC": ("Communication Services SPDR", "ETF"),
    "XLY": ("Consumer Discretionary SPDR", "ETF"),
    "XLP": ("Consumer Staples SPDR", "ETF"),
    "XLU": ("Utilities Select Sector SPDR", "ETF"),
    "XLRE": ("Real Estate Select Sector SPDR", "ETF"),
}


# ─── Build Derived Data Structures ───

# Remove placeholder duplicates (KVUE2, BALL2 used to avoid dict key collision)
_CLEANUP_KEYS = [k for k in _SP500_DATA if k.endswith("2") and k[:-1] in _SP500_DATA]
for _k in _CLEANUP_KEYS:
    del _SP500_DATA[_k]

COMPANY_NAMES: dict[str, str] = {}
STOCK_SECTORS: dict[str, str] = {}
for _ticker, (_name, _sector) in _SP500_DATA.items():
    COMPANY_NAMES[_ticker] = _name
    STOCK_SECTORS[_ticker] = _sector

# Add ETFs
ETF_TICKERS: list[str] = list(_ETF_DATA.keys())
for _ticker, (_name, _sector) in _ETF_DATA.items():
    COMPANY_NAMES[_ticker] = _name
    STOCK_SECTORS[_ticker] = _sector

# Full universe of all tracked securities
STOCK_UNIVERSE: list[str] = list(_SP500_DATA.keys())
ALL_SECURITIES: list[str] = STOCK_UNIVERSE + ETF_TICKERS
ETF_SET: frozenset[str] = frozenset(ETF_TICKERS)

# ─── Tier System ───
# TIER_1 (top 50 by market cap): Full Claude AI analysis + all engines
# TIER_2 (stocks 51-200): Price + technicals + fundamentals (no Claude AI)
# TIER_3 (stocks 201+): Price + technicals only
# ETF_TIER: Price + technicals + holdings composition

TIER_1: list[str] = [
    # Top 50 by approximate market cap
    "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "BRK.B", "AVGO", "TSLA", "LLY",
    "JPM", "V", "UNH", "MA", "ORCL", "COST", "HD", "NFLX", "CRM", "ABBV",
    "AMD", "BAC", "WMT", "PG", "MRK", "ADBE", "TMO", "ACN", "CSCO", "PEP",
    "LIN", "MCD", "ABT", "WFC", "GE", "IBM", "INTU", "CAT", "PM", "NOW",
    "TXN", "GS", "QCOM", "ISRG", "BKNG", "AXP", "AMGN", "RTX", "BA", "SPGI",
]
TIER_2: list[str] = [t for t in STOCK_UNIVERSE[: 200] if t not in TIER_1 and t not in ETF_SET]
# Fill to get exactly 150 in tier 2 if needed
if len(TIER_2) < 150:
    _remaining = [t for t in STOCK_UNIVERSE if t not in TIER_1 and t not in TIER_2 and t not in ETF_SET]
    TIER_2.extend(_remaining[:150 - len(TIER_2)])
TIER_3: list[str] = [t for t in STOCK_UNIVERSE if t not in TIER_1 and t not in TIER_2 and t not in ETF_SET]

TIER_1_SET: frozenset[str] = frozenset(TIER_1)
TIER_2_SET: frozenset[str] = frozenset(TIER_2)
TIER_3_SET: frozenset[str] = frozenset(TIER_3)

# Legacy aliases
FULL_ANALYSIS_TICKERS = TIER_1
PRICE_ONLY_TICKERS = TIER_3


def get_tier(ticker: str) -> str:
    """Return the analysis tier for a given ticker."""
    if ticker in ETF_SET:
        return "ETF"
    if ticker in TIER_1_SET:
        return "TIER_1"
    if ticker in TIER_2_SET:
        return "TIER_2"
    return "TIER_3"


# ─── GICS Sector List ───
GICS_SECTORS: list[str] = [
    "Information Technology",
    "Communication Services",
    "Consumer Discretionary",
    "Financials",
    "Health Care",
    "Energy",
    "Industrials",
    "Consumer Staples",
    "Utilities",
    "Real Estate",
    "Materials",
]

# Sector ETF mapping for correlations
SECTOR_ETF_MAP: dict[str, str] = {}
_SECTOR_TO_ETF = {
    "Information Technology": "XLK",
    "Communication Services": "XLC",
    "Consumer Discretionary": "XLY",
    "Financials": "XLF",
    "Health Care": "XLV",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Consumer Staples": "XLP",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Materials": "XLB",
}
# Semiconductor overrides -> SMH
_SEMIS = {"NVDA", "AMD", "AVGO", "INTC", "QCOM", "TXN", "AMAT", "MU", "SNPS", "LRCX",
          "KLAC", "CDNS", "MCHP", "NXPI", "ON", "MPWR", "SWKS", "QRVO", "SMCI"}
for _ticker, _sector in STOCK_SECTORS.items():
    if _ticker in _SEMIS:
        SECTOR_ETF_MAP[_ticker] = "SMH"
    elif _sector in _SECTOR_TO_ETF:
        SECTOR_ETF_MAP[_ticker] = _SECTOR_TO_ETF[_sector]


# Peer mapping for correlation analysis (at least 5 per sector)
PEER_MAP: dict[str, list[str]] = {
    # ── Information Technology ──
    "NVDA": ["AMD", "AVGO", "INTC", "QCOM", "AMAT"],
    "AAPL": ["MSFT", "GOOGL", "AVGO", "DELL", "HPQ"],
    "MSFT": ["AAPL", "GOOGL", "CRM", "ORCL", "NOW"],
    "AMD": ["NVDA", "INTC", "AVGO", "QCOM", "MU"],
    "AVGO": ["NVDA", "QCOM", "TXN", "MCHP", "NXPI"],
    "CRM": ["MSFT", "NOW", "ORCL", "ADBE", "WDAY"],
    "ADBE": ["CRM", "INTU", "ANSS", "CDNS", "ADSK"],
    "CSCO": ["JNPR", "ANET", "HPE", "FFIV", "MSI"],
    "ORCL": ["MSFT", "CRM", "IBM", "NOW", "SAP"],
    "INTC": ["AMD", "NVDA", "QCOM", "TXN", "MU"],
    "IBM": ["ORCL", "ACN", "CTSH", "EPAM", "IT"],
    "INTU": ["ADBE", "CRM", "WDAY", "PAYC", "HUBS"],
    "PANW": ["CRWD", "FTNT", "ZS", "GEN", "AKAM"],
    "DELL": ["HPQ", "HPE", "IBM", "SMCI", "WDC"],
    # ── Communication Services ──
    "GOOGL": ["META", "MSFT", "AMZN", "NFLX", "SNAP"],
    "META": ["GOOGL", "NFLX", "PINS", "SNAP", "DIS"],
    "NFLX": ["DIS", "META", "CMCSA", "WBD", "PARA"],
    "DIS": ["CMCSA", "NFLX", "WBD", "PARA", "LYV"],
    "CMCSA": ["DIS", "CHTR", "T", "VZ", "TMUS"],
    "TMUS": ["VZ", "T", "CMCSA", "CHTR", "UBER"],
    # ── Consumer Discretionary ──
    "AMZN": ["GOOGL", "MSFT", "WMT", "BKNG", "EBAY"],
    "TSLA": ["GM", "F", "NKE", "RIVN", "LCID"],
    "HD": ["LOW", "WMT", "COST", "TSCO", "BLDR"],
    "MCD": ["SBUX", "YUM", "CMG", "DPZ", "DRI"],
    "NKE": ["LULU", "DECK", "RL", "TPR", "ULTA"],
    "LOW": ["HD", "WMT", "TSCO", "BLDR", "GPC"],
    "BKNG": ["EXPE", "MAR", "HLT", "ABNB", "RCL"],
    "SBUX": ["MCD", "CMG", "YUM", "DPZ", "DRI"],
    "CMG": ["MCD", "SBUX", "YUM", "DPZ", "DRI"],
    "LULU": ["NKE", "DECK", "RL", "ULTA", "TPR"],
    # ── Financials ──
    "JPM": ["BAC", "GS", "MS", "WFC", "C"],
    "V": ["MA", "PYPL", "SQ", "AXP", "FI"],
    "MA": ["V", "PYPL", "SQ", "AXP", "GPN"],
    "BAC": ["JPM", "WFC", "C", "USB", "PNC"],
    "GS": ["MS", "JPM", "BLK", "SCHW", "RJF"],
    "BRK.B": ["JPM", "BAC", "PGR", "CB", "TRV"],
    "BLK": ["BRK.B", "SCHW", "TROW", "BEN", "IVZ"],
    "SPGI": ["MCO", "MSCI", "ICE", "CME", "NDAQ"],
    "PGR": ["ALL", "TRV", "CB", "MET", "AFL"],
    # ── Health Care ──
    "UNH": ["ELV", "CI", "HUM", "CNC", "MOH"],
    "JNJ": ["PFE", "MRK", "ABT", "MDT", "SYK"],
    "LLY": ["ABBV", "MRK", "PFE", "REGN", "VRTX"],
    "ABBV": ["LLY", "MRK", "PFE", "BMY", "AMGN"],
    "MRK": ["PFE", "ABBV", "LLY", "BMY", "GILD"],
    "TMO": ["DHR", "A", "BDX", "MTD", "ILMN"],
    "ISRG": ["SYK", "BSX", "MDT", "EW", "GEHC"],
    # ── Energy ──
    "XOM": ["CVX", "COP", "SLB", "EOG", "OXY"],
    "CVX": ["XOM", "COP", "EOG", "SLB", "MPC"],
    "COP": ["XOM", "CVX", "EOG", "DVN", "FANG"],
    "SLB": ["HAL", "BKR", "XOM", "CVX", "COP"],
    "EOG": ["COP", "DVN", "FANG", "CTRA", "PXD"],
    "MPC": ["PSX", "VLO", "XOM", "CVX", "COP"],
    # ── Industrials ──
    "CAT": ["DE", "HON", "GE", "ETN", "EMR"],
    "GE": ["HON", "RTX", "BA", "LMT", "HWM"],
    "HON": ["CAT", "EMR", "ETN", "JCI", "ROK"],
    "LMT": ["RTX", "BA", "NOC", "GD", "LHX"],
    "RTX": ["LMT", "BA", "NOC", "GD", "HII"],
    "BA": ["LMT", "RTX", "GD", "NOC", "HWM"],
    "UPS": ["FDX", "CSX", "NSC", "UNP", "JBHT"],
    "UNP": ["CSX", "NSC", "UPS", "FDX", "JBHT"],
    "DE": ["CAT", "PCAR", "HON", "ETN", "AGCO"],
    "ADP": ["PAYX", "PAYC", "DAY", "BR", "FI"],
    # ── Consumer Staples ──
    "PG": ["KO", "PEP", "CL", "CHD", "CLX"],
    "KO": ["PEP", "MNST", "KDP", "STZ", "TAP"],
    "PEP": ["KO", "MNST", "KDP", "GIS", "K"],
    "COST": ["WMT", "TGT", "KR", "SYY", "BJ"],
    "WMT": ["COST", "TGT", "KR", "DG", "DLTR"],
    "PM": ["MO", "STZ", "BF.B", "TAP", "KO"],
    "CL": ["PG", "CHD", "CLX", "EL", "KMB"],
    "MDLZ": ["HSY", "GIS", "K", "SJM", "CAG"],
    # ── Utilities ──
    "NEE": ["DUK", "SO", "AEP", "D", "SRE"],
    "DUK": ["SO", "NEE", "AEP", "D", "EXC"],
    "SO": ["DUK", "NEE", "AEP", "D", "EXC"],
    "AEP": ["NEE", "DUK", "SO", "D", "XEL"],
    "CEG": ["VST", "NRG", "NEE", "PCG", "EXC"],
    # ── Real Estate ──
    "PLD": ["DLR", "EQIX", "PSA", "SPG", "AMT"],
    "AMT": ["CCI", "SBAC", "EQIX", "DLR", "PLD"],
    "EQIX": ["DLR", "AMT", "CCI", "SBAC", "PLD"],
    "O": ["VICI", "SPG", "KIM", "REG", "FRT"],
    # ── Materials ──
    "LIN": ["APD", "SHW", "ECL", "DD", "PPG"],
    "FCX": ["NEM", "NUE", "VMC", "MLM", "ALB"],
    "SHW": ["PPG", "LIN", "APD", "ECL", "RPM"],
    "NEM": ["FCX", "ALB", "NUE", "VMC", "MLM"],
    "ECL": ["LIN", "APD", "SHW", "DD", "PPG"],
}


# ─── Factor Models ───

class FactorDetail(BaseModel):
    score: float = Field(ge=-2.0, le=2.0)
    reason: str


class FactorScore(BaseModel):
    name: str
    score: float = Field(ge=-2.0, le=2.0)


class Alternative(BaseModel):
    ticker: str
    company_name: str
    score: float
    signal: Signal
    reason: str
    alt_type: str  # "same_sector_peer" or "inverse_hedge"


# ─── Signal Results ───

class SignalResult(BaseModel):
    ticker: str
    company_name: str
    composite_score: float = Field(ge=1.0, le=10.0)
    signal: Signal
    confidence: Confidence = Confidence.MEDIUM
    insight: str
    reasoning: str = ""
    factors: list[FactorScore] = []
    factor_details: dict[str, FactorDetail] = {}
    alternatives: list[Alternative] = []
    analyzed_at: datetime
    updated_at: Optional[datetime] = None


class FeedItem(BaseModel):
    id: str
    ticker: str
    company_name: str
    composite_score: float
    signal: Signal
    insight: str
    top_factors: list[FactorScore]
    updated_at: datetime


# ─── Portfolio Models ───

class Holding(BaseModel):
    id: str
    ticker: str
    company_name: str
    shares: float
    avg_cost: float
    current_price: Optional[float] = None
    weight: Optional[float] = None


class Portfolio(BaseModel):
    id: str
    user_id: str
    name: str
    holdings: list[Holding]
    total_value: float = 0.0
    created_at: datetime
    updated_at: datetime


# ─── Strategy Models ───

class OptimizationResult(BaseModel):
    weights: dict[str, float]
    expected_return: float
    expected_volatility: float
    sharpe_ratio: float


class MonteCarloPoint(BaseModel):
    expected_return: float
    volatility: float
    sharpe_ratio: float
    weights: dict[str, float]


class StrategyResult(BaseModel):
    optimized: OptimizationResult
    efficient_frontier: list[MonteCarloPoint]
    current_portfolio_metrics: OptimizationResult


# ─── Scoring Utilities ───

def compute_composite_score(factor_scores: dict[str, float]) -> float:
    """Compute the weighted composite score from 18 factor scores.

    Args:
        factor_scores: Dict mapping factor IDs (A1-F3) to scores (-2 to +2).

    Returns:
        Composite score mapped to 1-10 scale.
    """
    total_weight = sum(CATEGORY_WEIGHTS.values())
    weighted_sum = 0.0

    for category, weight in CATEGORY_WEIGHTS.items():
        factor_ids = CATEGORY_FACTOR_MAP[category]
        scores = [factor_scores.get(fid, 0.0) for fid in factor_ids]
        if scores:
            category_avg = sum(scores) / len(scores)
        else:
            category_avg = 0.0
        weighted_sum += weight * category_avg

    # Normalize to [-2, +2] range
    normalized = weighted_sum / total_weight

    # Map from [-2, +2] to [1, 10]
    score_10 = ((normalized + 2) / 4) * 9 + 1
    return round(max(1.0, min(10.0, score_10)), 1)


def determine_signal(score: float, mean: float = 5.0, stddev: float = 1.5) -> Signal:
    """Determine BUY/HOLD/SELL signal from composite score.

    Uses mean +/- 0.5*stddev thresholds for ~25% BUY, 50% HOLD, 25% SELL distribution.
    Default mean=5.0, stddev=1.5 gives thresholds of 4.25 and 5.75.
    """
    buy_threshold = mean + 0.5 * stddev
    sell_threshold = mean - 0.5 * stddev
    if score <= sell_threshold:
        return Signal.SELL
    elif score >= buy_threshold:
        return Signal.BUY
    else:
        return Signal.HOLD


def normalize_signals(scores: list[float]) -> tuple[float, float]:
    """Compute mean and stddev for a list of composite scores.

    Returns (mean, stddev) to be passed to determine_signal() for
    relative signal classification across the universe.
    """
    import math
    if not scores:
        return 5.0, 1.5
    n = len(scores)
    mean = sum(scores) / n
    if n < 2:
        return mean, 1.5
    variance = sum((s - mean) ** 2 for s in scores) / (n - 1)
    stddev = math.sqrt(variance) if variance > 0 else 1.5
    # Clamp stddev to reasonable range
    stddev = max(0.5, min(3.0, stddev))
    return mean, stddev


def determine_confidence(factor_scores: dict[str, float]) -> Confidence:
    """Determine confidence level based on data coverage.

    LOW: <50% of factors have non-zero scores
    MEDIUM: 50-80% have data
    HIGH: >80% have data
    """
    total = len(FACTOR_IDS)
    with_data = sum(1 for fid in FACTOR_IDS if factor_scores.get(fid, 0.0) != 0.0)
    ratio = with_data / total

    if ratio < 0.5:
        return Confidence.LOW
    elif ratio <= 0.8:
        return Confidence.MEDIUM
    else:
        return Confidence.HIGH
