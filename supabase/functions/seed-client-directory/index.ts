import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PASSWORD = "HPA1234$";

interface ClientData {
  id: string;
  name: string;
  status: string;
  slug: string;
  ghl_location_id?: string;
  ghl_api_key?: string;
  meta_ad_account_id?: string;
  website?: string;
  business_manager_url?: string;
}

interface ClientSettingsData {
  client_id: string;
  funded_pipeline_id?: string;
  tracked_calendar_ids?: string[];
  reconnect_calendar_ids?: string[];
  ads_library_url?: string;
}

interface FunnelStep {
  name: string;
  url: string;
}

const clients: ClientData[] = [
  {
    id: "f414feaa-c68e-4e68-b35d-fcefb8ff86e1",
    name: "Blue Capital",
    status: "active",
    slug: "blue-capital",
    ghl_location_id: "N35iP9cknP7B9ewTsTD3",
    ghl_api_key: "pit-17108bb5-a2d3-4945-9ffa-4b0dd99b8284",
    meta_ad_account_id: "478773718246380",
    website: "https://bluecapfunds.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=478773718246380&business_id=1248137532847612&global_scope_id=1248137532847612",
  },
  {
    id: "0d75a471-2713-4332-b80e-d5d84b98d677",
    name: "Blue Metric Group",
    status: "active",
    slug: "blue-metric-group",
    ghl_location_id: "KqLjH5mN2B6pkeYyGqSn",
    ghl_api_key: "pit-b9539c3e-b6c3-46f6-a4ba-b0845c1ed40c",
    meta_ad_account_id: "1404238774520445",
    website: "https://www.bluemetricgroup.com/",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1404238774520445&business_id=187989953882537",
  },
  {
    id: "d402676b-99ad-49e2-b96b-1fc24040076d",
    name: "Evia Company",
    status: "onboarding",
    slug: "evia-company",
    ghl_location_id: "dKbeWAHhXJZXa35QhUs1",
    ghl_api_key: "pit-fc4abe62-5701-4570-8b17-966881542002",
  },
  {
    id: "8689db32-4ba7-47ef-81d1-6bf72f645aa1",
    name: "Freaky Fast Investments",
    status: "active",
    slug: "freaky-fast-investments",
    ghl_location_id: "6Ro2iikW0fgGSKA5SBtM",
    ghl_api_key: "pit-6efebef8-2289-467e-a1a7-6864cc83e774",
    meta_ad_account_id: "9691495154255474",
    website: "https://freakyfasthomebuyers.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=9691495154255474&business_id=174150765124755&global_scope_id=174150765124755",
  },
  {
    id: "18acd701-92ff-4bbc-86aa-1f7cd9a9c973",
    name: "HPA - AI Capital Raising",
    status: "inactive",
    slug: "hpa-ai-capital-raising",
    ghl_location_id: "ZcPPQTHBxBWlnM1WyjvU",
    ghl_api_key: "pit-546ab238-d13b-4eb8-a970-249152ea33e3",
    meta_ad_account_id: "2023402527841060",
    website: "https://sagecapinvest.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?global_scope_id=1840981092633299&business_id=1840981092633299&act=2023402527841060",
  },
  {
    id: "055eea03-76b7-4e6b-aa1d-6fbd2719e532",
    name: "HRT",
    status: "active",
    slug: "hrt",
    ghl_location_id: "kIFWiDw55zvLUU850tg1",
    ghl_api_key: "pit-a9223b4a-dd92-4b00-a71d-49dbcc5c9fbd",
    meta_ad_account_id: "750916930993644",
    website: "https://healingrt.com/",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=750916930993644&business_id=24051895727839079&global_scope_id=24051895727839079",
  },
  {
    id: "5bffa91b-87a1-42b5-a155-406b15d719e5",
    name: "JJ Dental",
    status: "active",
    slug: "jj-dental",
    ghl_location_id: "bim7RELnPgh7w6jeYuIx",
    ghl_api_key: "pit-0f0f75d2-9aaa-4dd1-b381-8116a0d77947",
    meta_ad_account_id: "26761780476768960",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=26761780476768960&business_id=511957804570782&global_scope_id=511957804570782",
  },
  {
    id: "d16175f2-6376-493d-aae4-bfb3e4a32e50",
    name: "Kroh Exploration",
    status: "active",
    slug: "kroh-exploration",
    ghl_location_id: "qrqhwZXFHJVA4G43IDND",
    ghl_api_key: "pit-34c6c8f7-3b8c-4623-8041-599c3626525b",
    meta_ad_account_id: "990227061983816",
    website: "https://krohexploration.com/",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=990227061983816&business_id=206851444169459&global_scope_id=206851444169459",
  },
  {
    id: "70a87509-80b3-4ee7-966e-22d976acfff6",
    name: "Land Value Alpha",
    status: "active",
    slug: "land-value-alpha",
    ghl_location_id: "VTy6KurtnuMJKXFS71Yh",
    ghl_api_key: "pit-5d9661fa-796c-49b3-9cdf-28eeab9d3b08",
    meta_ad_account_id: "687542664051992",
    website: "https://landvaluealpha.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=478773718246380&business_id=1248137532847612&global_scope_id=1248137532847612",
  },
  {
    id: "c9d7dc91-2940-4f2e-9672-b9951ee23003",
    name: "Lansing Capital",
    status: "active",
    slug: "lansing-capital",
    ghl_location_id: "yleFRyMF0wcpnBZRyKm0",
    ghl_api_key: "pit-4bf00f3b-c40e-44e8-8679-7ab66959fafb",
    meta_ad_account_id: "1168816481269757",
    website: "https://lansingcapitalgroup.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?global_scope_id=458511660664224&business_id=458511660664224&act=1168816481269757",
  },
  {
    id: "3457607d-0f1b-4ef8-b20f-65bdf4f3c82d",
    name: "Legacy Capital",
    status: "active",
    slug: "legacy-capital",
    ghl_location_id: "wzuqmhxb2ealf5FlAbfa",
    ghl_api_key: "pit-c615f7b9-7059-4453-b17d-f8a14f22256b",
    meta_ad_account_id: "2627470054286181",
    website: "https://www.legacycapital.fund",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?global_scope_id=782502647837677&business_id=782502647837677&act=2627470054286181",
  },
  {
    id: "924aee58-b3a6-42fb-b10f-0945db45cdde",
    name: "LSCRE",
    status: "active",
    slug: "lscre",
    ghl_location_id: "v479s6u0THfMb2XBkNx5",
    ghl_api_key: "pit-bbdc2240-ab28-4ab4-b879-c6d38e1d6729",
    meta_ad_account_id: "1864632820857907",
    website: "https://www.lscre.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?global_scope_id=1370781040279940&business_id=1370781040279940&act=1864632820857907",
  },
  {
    id: "9bed8162-6a89-4ec0-b233-aba50b2ee563",
    name: "LSCRE - Leasing",
    status: "active",
    slug: "lscre-leasing",
  },
  {
    id: "43dd2062-ace1-4e24-b359-0470d4c466c6",
    name: "LSCRE – Hiring",
    status: "active",
    slug: "lscre-hiring",
    ghl_location_id: "UiZnJi6oQFchYWcZUQXI",
    ghl_api_key: "pit-b9925c45-ca02-46f2-99a4-daa144e37e17",
    website: "https://lscre.com",
  },
  {
    id: "268edbc5-d5ab-4425-96a3-1eb30525c08e",
    name: "OBL",
    status: "active",
    slug: "obl",
    ghl_location_id: "FTMjnrVvleqIiekNRrPU",
    ghl_api_key: "pit-ca5ae6b3-7013-489d-b1aa-60abd0e11a8d",
    website: "https://texasstateoil.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=384405641029443",
  },
  {
    id: "a5b63280-fe3f-4d67-a6c6-b387262fc5dd",
    name: "Paradyme",
    status: "active",
    slug: "paradyme",
    ghl_location_id: "ROg8rJAnV4jtuQrvtxXN",
    ghl_api_key: "pit-2cf1d126-62ce-425a-b419-51b33dcb9d33",
    meta_ad_account_id: "363174697",
    website: "https://www.paradymecompanies.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=363174697&business_id=121324115770017&global_scope_id=121324115770017",
  },
  {
    id: "098bdcf2-fa06-4801-8505-676535e6b5ce",
    name: "Quad J Capital",
    status: "active",
    slug: "quad-j-capital",
    ghl_location_id: "yjKzErZPpHrL93NV5CTw",
    ghl_api_key: "pit-d8968d39-5057-4928-a0c8-3156f3a451a7",
    meta_ad_account_id: "1957781308470875",
    website: "https://www.quadjcapital.com/",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?global_scope_id=342026236318089&business_id=342026236318089&act=1957781308470875",
  },
  {
    id: "47b10f07-328a-4c03-9542-86ba8599138b",
    name: "Simple House Capital Group",
    status: "active",
    slug: "simple-house-capital-group",
    ghl_location_id: "tgKe2vlHYK6i6s4MKIkz",
    ghl_api_key: "pit-b0727398-c0ea-417a-99a4-9cdcd19a6854",
    meta_ad_account_id: "4176293279306334",
    website: "https://www.simplehousecapital.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=4176293279306334&business_id=559237559996048&global_scope_id=559237559996048",
  },
  {
    id: "6163dbe3-3292-4151-88e8-f4530d6c0d73",
    name: "Texas State Oil",
    status: "active",
    slug: "texas-state-oil",
    ghl_location_id: "n65jOm6vg2TmvP866BB2",
    ghl_api_key: "pit-c70a58e2-92bd-436e-88ab-7abcedc87583",
    meta_ad_account_id: "734079909353011",
    website: "https://texasstateoil.com/",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=363174697&business_id=121324115770017&global_scope_id=121324115770017",
  },
  {
    id: "56d833ca-1c70-44f2-a653-9faa76657d43",
    name: "Think & Grow Rich The Movie",
    status: "active",
    slug: "think-grow-rich-the-movie",
    ghl_location_id: "FTMjnrVvleqIiekNRrPU",
    ghl_api_key: "pit-ca5ae6b3-7013-489d-b1aa-60abd0e11a8d",
    meta_ad_account_id: "384405641029443",
    website: "https://thethinkandgrowrich.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=384405641029443",
  },
  {
    id: "9b1b0228-9e7f-402d-91ee-8da7d0cfeb9b",
    name: "Titan Management Group",
    status: "active",
    slug: "titan-management-group",
    ghl_location_id: "shTzXIffj7md1mkojC5a",
    ghl_api_key: "pit-bafc33b5-a0cb-4c2a-a244-072456bde383",
    meta_ad_account_id: "1450293606526682",
    website: "https://www.titanassetmanagement.com",
    business_manager_url: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?global_scope_id=802357855529691&business_id=802357855529691&act=1450293606526682",
  },
];

const clientSettings: ClientSettingsData[] = [
  {
    client_id: "f414feaa-c68e-4e68-b35d-fcefb8ff86e1",
    funded_pipeline_id: "t8OHTTkxbcKvfInhCuEb",
    tracked_calendar_ids: ["nNRBXQt3nuU370VG72ct", "u7h8nhXXwPF7FSCvsMOu", "0cN0jObFCwvqECAlUZFk", "vAFN3ghGSB6q80OyxDnH"],
    reconnect_calendar_ids: ["4V7RgTfh7jnFSA6ulNcJ", "u8ene2C1Qfxhrt158cvc"],
    ads_library_url: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&view_all_page_id=584060471449732",
  },
  {
    client_id: "0d75a471-2713-4332-b80e-d5d84b98d677",
    funded_pipeline_id: "t8OHTTkxbcKvfInhCuEb",
  },
  {
    client_id: "d402676b-99ad-49e2-b96b-1fc24040076d",
    funded_pipeline_id: "Sf79PYjRu1kZf7fBaHyO",
    tracked_calendar_ids: ["5yPJEbf8omFO4YZzZDhz"],
    reconnect_calendar_ids: ["cN1myP7XlSim0eTGkgsY"],
  },
  {
    client_id: "8689db32-4ba7-47ef-81d1-6bf72f645aa1",
    funded_pipeline_id: "Dlh4J4O4lJxUv7NnKvqt",
    tracked_calendar_ids: ["AKrfUgcYOgqUjmKkRm4l", "JvCcA5JXP5a7LQTTDP6T", "UBXl1DhE0DEv9ZTivPPL", "XMaCbq9HsB2wf6jlQvkS", "gIyeuW59N4JiktlmtkMe", "xSgQwz4a7c9DXtGjAB7M"],
    reconnect_calendar_ids: ["bmi9h5cFaS8FtdxJG5KL"],
  },
  {
    client_id: "18acd701-92ff-4bbc-86aa-1f7cd9a9c973",
    funded_pipeline_id: "toKwdxZRUBcWjAfihyHT",
    tracked_calendar_ids: ["a3YI7y0PqN6wt5RKPTQX", "oOgDvYNKOvZCcXCP3gAn", "wT6ZF0CPKxPIXeeO5x9Y", "D9Eq3JP0k30HBh4s39GG", "5NMmbITnqFbds1yWP3TD", "35XuJAAvPdr0w5Tf9sPf"],
    reconnect_calendar_ids: ["PMmg9rJlH8JuiTFG6rBH"],
  },
  {
    client_id: "055eea03-76b7-4e6b-aa1d-6fbd2719e532",
    funded_pipeline_id: "RLIxLdEKtRhRq3qmSS2r",
    tracked_calendar_ids: ["06GfZ23DJPJGFQDXKf3M", "17WMsQcAJzXWdFpOntKR", "L0X5KDtdnER1KM2sarBz"],
    reconnect_calendar_ids: ["KW9n3sX3TaQVMSo23085", "V5uSnmdJRTnRTOOBqfxd"],
  },
  {
    client_id: "5bffa91b-87a1-42b5-a155-406b15d719e5",
  },
  {
    client_id: "d16175f2-6376-493d-aae4-bfb3e4a32e50",
    funded_pipeline_id: "1c2ULp3Mi3nfoiSlw0KD",
    tracked_calendar_ids: ["tkdc7DAhUg5vgDDygmbT"],
    reconnect_calendar_ids: ["SMTuIwpwgzRFg2CNps0x"],
  },
  {
    client_id: "70a87509-80b3-4ee7-966e-22d976acfff6",
    funded_pipeline_id: "NQYglrEw9aJ2856yWiBz",
    tracked_calendar_ids: ["gJHX0Aw8qgJ3bEh1fc54", "tcys5ld6w0E2KdKfVMQ6", "vkimKabUh47UsDbbWzUY"],
    reconnect_calendar_ids: ["woSx3yrI44oTgXZJctuD", "V8MKAFx9pXbZvupVkSzq", "BDeRCuSjyweaypjRvLli"],
  },
  {
    client_id: "c9d7dc91-2940-4f2e-9672-b9951ee23003",
    funded_pipeline_id: "FUXmhzRZCM25nt57TEOS",
    tracked_calendar_ids: ["PVFgzitlT9IVlWNJTbJ7"],
    reconnect_calendar_ids: ["i6BcvujqoZRJaMtaIVrO"],
    ads_library_url: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&view_all_page_id=584060471449732",
  },
  {
    client_id: "3457607d-0f1b-4ef8-b20f-65bdf4f3c82d",
    funded_pipeline_id: "f8eikv9xHGCqQZ8jBzLo",
    tracked_calendar_ids: ["hqDaYjaWuMoJtpXqMswz", "oyRajuW5VOXqCwOXvfwd", "bWkZwrrATP02m44ZpVX3"],
    reconnect_calendar_ids: ["HJ8yz3jipXygztDFKdm6"],
  },
  {
    client_id: "924aee58-b3a6-42fb-b10f-0945db45cdde",
    funded_pipeline_id: "d5isCcQtIR997jczGV0W",
    tracked_calendar_ids: ["dOI1FWOT9CZa7ifbkYGp", "mjRnPhbC0VPjsaCvxWXA"],
    reconnect_calendar_ids: ["lbDROxJxVv09bnJfwqgz"],
  },
  {
    client_id: "9bed8162-6a89-4ec0-b233-aba50b2ee563",
  },
  {
    client_id: "43dd2062-ace1-4e24-b359-0470d4c466c6",
    funded_pipeline_id: "8SJ7lVppf2enzvp6mcdh",
    tracked_calendar_ids: ["MzRTwA5fgaB2t43rZyoq"],
    reconnect_calendar_ids: ["kW6s2LDh020k6v9mpb2C"],
  },
  {
    client_id: "268edbc5-d5ab-4425-96a3-1eb30525c08e",
    funded_pipeline_id: "slaPMxdSy1QaL8W9gLbj",
  },
  {
    client_id: "a5b63280-fe3f-4d67-a6c6-b387262fc5dd",
    funded_pipeline_id: "qkuiqBYXtNPtehiLs0zg",
    tracked_calendar_ids: ["xobiSzA1IaF1auAQ7ZqB"],
    reconnect_calendar_ids: ["clpRwqRiL3PCDmmYr61Z"],
  },
  {
    client_id: "098bdcf2-fa06-4801-8505-676535e6b5ce",
    funded_pipeline_id: "v1bjlQM8buTBDrVr16xQ",
    tracked_calendar_ids: ["O8KILkTKQzBrwUekuaPF"],
    reconnect_calendar_ids: ["QJ9CsixV6eUIUMmcZjvE"],
  },
  {
    client_id: "47b10f07-328a-4c03-9542-86ba8599138b",
    funded_pipeline_id: "toKwdxZRUBcWjAfihyHT",
    tracked_calendar_ids: ["AAb2yW908txMlniLmyUR", "jZLLTQDk8GOUh25nAdnh"],
  },
  {
    client_id: "6163dbe3-3292-4151-88e8-f4530d6c0d73",
    funded_pipeline_id: "RqgQCR9T7paLmDHitJGq",
    tracked_calendar_ids: ["CFvwddHCyKNT3uKeQo8Q"],
    reconnect_calendar_ids: ["daSrEsF4J5ljWgPOaHz7"],
  },
  {
    client_id: "56d833ca-1c70-44f2-a653-9faa76657d43",
    funded_pipeline_id: "slaPMxdSy1QaL8W9gLbj",
    tracked_calendar_ids: ["0JlXERB4Va8CUBSKvmKH"],
    reconnect_calendar_ids: ["rqJwnImpZBPuzjXq6nth"],
  },
  {
    client_id: "9b1b0228-9e7f-402d-91ee-8da7d0cfeb9b",
    funded_pipeline_id: "E4qGRQZeLL5tqbZ5P3jv",
    tracked_calendar_ids: ["RVTlyS0nMdeNQYhUync9", "giE1h5UR3uZMVxzbMA3a"],
    reconnect_calendar_ids: ["Rye2jSaqKmQpZ1MngCmu", "zi2RTqHKJLEf9AmmlXUX"],
  },
];

const clientFunnelSteps: Record<string, FunnelStep[]> = {
  "f414feaa-c68e-4e68-b35d-fcefb8ff86e1": [
    { name: "test", url: "fb://lead-form" },
    { name: "1031 Exchange", url: "https://investbluecapfunds.com/1031" },
    { name: "Opt-In", url: "https://start.investbluecapfunds.com/" },
    { name: "1031 Opt-In", url: "https://investbluecapfunds.com/1031-exchange" },
    { name: "Thank You", url: "https://investbluecapfunds.com/thank-you" },
    { name: "1031 Book A Call", url: "https://investbluecapfunds.com/book" },
    { name: "1031 Calendar", url: "https://investbluecapfunds.com/calendar-1031-exchange" },
    { name: "Thank you page Generic", url: "https://investbluecapfunds.com/thank-you" },
  ],
  "0d75a471-2713-4332-b80e-d5d84b98d677": [
    { name: "FB Lead Form", url: "fb://lead-form" },
    { name: "FB Lead Form", url: "fb://lead-form" },
    { name: "Calendar page", url: "https://invest.bluemetricgroup.com/knoxville" },
    { name: "Calendar Page", url: "https://invest.bluemetricgroup.com/vista_lago" },
    { name: "Thank you page", url: "https://invest.bluemetricgroup.com/call-confirmed-vista-lago" },
    { name: "Thank you page", url: "https://invest.bluemetricgroup.com/call-confirmed-knoxville" },
  ],
  "d402676b-99ad-49e2-b96b-1fc24040076d": [
    { name: "Calendar", url: "https://invest.eviacompany.com/information" },
    { name: "optin", url: "https://invest.eviacompany.com/start1" },
    { name: "Thank You", url: "https://invest.eviacompany.com/info" },
  ],
  "8689db32-4ba7-47ef-81d1-6bf72f645aa1": [
    { name: "15 Debt Fund", url: "https://invest.freakyfasthomebuyers.com/info" },
    { name: "Thank You", url: "https://invest.freakyfasthomebuyers.com/typ" },
  ],
  "18acd701-92ff-4bbc-86aa-1f7cd9a9c973": [
    { name: "AI Capital Raising - HomePage", url: "https://aicapitalraising.com/book" },
    { name: "Thank You Page | Ensure Show Up", url: "https://aicapitalraising.com/learnmore" },
    { name: "AI Capital Raising Accelerator Checkout", url: "https://aicapitalraising.com/start" },
    { name: "Onboarding Survey", url: "https://aicapitalraising.com/onboarding" },
    { name: "Ad Account Access", url: "https://aicapitalraising.com/access" },
    { name: "Kickoff Call", url: "https://aicapitalraising.com/kickoff" },
    { name: "Next Steps", url: "https://aicapitalraising.com/steps-5240" },
    { name: "HPA Funding Application", url: "https://aicapitalraising.com/fund-application" },
    { name: "Ai Capital Raising Accelerator", url: "https://aicapitalraising.com/info-3061" },
    { name: "Ai Capital Raising Accelerator Thank You", url: "https://aicapitalraising.com/thank-you-for-purchasing-5847" },
    { name: "AI Capital Raising Accelerator - Checkout", url: "https://aicapitalraising.com/checkout-8602" },
    { name: "Booked Confirmed", url: "https://aicapitalraising.com/confirmed" },
  ],
  "055eea03-76b7-4e6b-aa1d-6fbd2719e532": [
    { name: "Lead Form", url: "fb://lead-form" },
    { name: "1031", url: "fb://lead-form" },
    { name: "Lead Form > Calendar", url: "https://invest.healingrt.com/book" },
    { name: "1031", url: "https://invest.healingrt.com/schedule" },
    { name: "Info + Thank You", url: "https://invest.healingrt.com/due-diligence" },
    { name: "Thank You Page", url: "https://invest.healingrt.com/due-diligence" },
    { name: "HRT Investment Decision Calendar", url: "https://invest.healingrt.com/investment-call" },
  ],
  "5bffa91b-87a1-42b5-a155-406b15d719e5": [
    { name: "Cosmetic Dentistry", url: "https://go.jjdental.com/jj-cosmetic-dentistry" },
    { name: "COSMETIC DENTISTRY", url: "https://go.jjdental.com/cosmetic-dentistry" },
    { name: "DENTAL IMPLANTS", url: "https://go.jjdental.com/dental-implants" },
    { name: "Dental Implants", url: "https://go.jjdental.com/jj-dental-implants" },
    { name: "Veneers", url: "https://go.jjdental.com/jj-veneers" },
    { name: "VENEERS", url: "https://go.jjdental.com/veneers" },
    { name: "TEETH WHITENING", url: "https://go.jjdental.com/teeth-whitening" },
    { name: "Teeth Whitening", url: "https://go.jjdental.com/jj-teeth-whitening" },
    { name: "Crowns & Bridges", url: "https://go.jjdental.com/jj-crowns-bridges" },
    { name: "FREE CONSULTATION", url: "https://go.jjdental.com/consultation" },
    { name: "Thank You > Call Downtown", url: "https://go.jjdental.com/thankyou-downtown" },
    { name: "Tooth-Colored Fillings", url: "https://go.jjdental.com/jj-tooth-colored-fillings" },
    { name: "Success! [Form Submission]", url: "https://go.jjdental.com/jj-dental-success" },
    { name: "Dr. Baez", url: "https://go.jjdental.com/partnered" },
  ],
  "d16175f2-6376-493d-aae4-bfb3e4a32e50": [
    { name: "Investment Info", url: "https://go.krohexploration.com/investment-info" },
    { name: "Thank You Page", url: "https://go.krohexploration.com/thank-you" },
  ],
  "70a87509-80b3-4ee7-966e-22d976acfff6": [
    { name: "Optin", url: "https://invest.landvaluealpha.com/start" },
    { name: "Calendar", url: "https://invest.landvaluealpha.com/information" },
    { name: "Reconnect Calendar", url: "https://invest.landvaluealpha.com/reconnect" },
    { name: "Thank You", url: "https://invest.landvaluealpha.com/thank-you" },
    { name: "After Call Report", url: "https://invest.landvaluealpha.com/report" },
    { name: "Disqualified Page", url: "https://invest.landvaluealpha.com/dq" },
  ],
  "c9d7dc91-2940-4f2e-9672-b9951ee23003": [
    { name: "Example", url: "fb://lead-form" },
    { name: "Calendar + Optin", url: "https://invest.lansingcapitalgroup.com/info" },
    { name: "Thank You + FAQ", url: "https://invest.lansingcapitalgroup.com/thank-you" },
  ],
  "3457607d-0f1b-4ef8-b20f-65bdf4f3c82d": [
    { name: "FB Lead", url: "fb://lead-form" },
    { name: "Opt-In", url: "https://invest.legacycapital.fund/info-page" },
    { name: "FB Lead", url: "fb://lead-form" },
    { name: "Book Call", url: "https://invest.legacycapital.fund/book-call" },
    { name: "1) Book A Call", url: "https://invest.legacycapital.fund/re-info" },
    { name: "1) Info x BAC", url: "https://invest.legacycapital.fund/info" },
    { name: "2) Info + Thank You", url: "https://invest.legacycapital.fund/thank-you-600037" },
    { name: "2) Info + Thank You", url: "https://invest.legacycapital.fund/thank-you" },
    { name: "Privacy Policy", url: "https://invest.legacycapital.fund/privacy-policy" },
    { name: "Terms and Conditions", url: "https://invest.legacycapital.fund/terms-and-conditions" },
    { name: "After Call Report", url: "https://invest.legacycapital.fund/reporting" },
  ],
  "924aee58-b3a6-42fb-b10f-0945db45cdde": [
    { name: "FB Lead Example", url: "fb://lead-form" },
    { name: "Example", url: "fb://lead-form" },
    { name: "Discovery Call - Craig", url: "https://invest.lscre.com/book" },
    { name: "1031", url: "https://invest.lscre.com/1031-book" },
    { name: "Info + Thank You", url: "https://invest.lscre.com/info" },
    { name: "Thank You Page", url: "https://invest.lscre.com/info" },
  ],
  "a5b63280-fe3f-4d67-a6c6-b387262fc5dd": [
    { name: "Calendar Page", url: "https://invest.paradymecompanies.com/info-1" },
    { name: "Opt In", url: "https://investwithparadyme.com/" },
    { name: "Thank You Page", url: "https://invest.paradymecompanies.com/info" },
    { name: "Info Page", url: "https://invest.paradymecompanies.com/info" },
  ],
  "098bdcf2-fa06-4801-8505-676535e6b5ce": [
    { name: "FB", url: "fb://lead-form" },
    { name: "Lead + Calendar", url: "https://desertmountain.lovable.app" },
    { name: "Calendar", url: "https://invest.quadjcapital.com/information" },
    { name: "Info + Thank You", url: "https://invest.quadjcapital.com/info" },
  ],
  "6163dbe3-3292-4151-88e8-f4530d6c0d73": [],
  "56d833ca-1c70-44f2-a653-9faa76657d43": [
    { name: "FB Ads Approved", url: "https://thethinkandgrowrich.com/exposed-fb" },
    { name: "Order Page", url: "https://thethinkandgrowrich.com/ordernow" },
    { name: "Upsell 1: Personal Development Bundle", url: "https://thethinkandgrowrich.com/plroto" },
    { name: "Downsell: Personal Development Bundle (Discounted)", url: "https://thethinkandgrowrich.com/plroto-100" },
    { name: "OTO: AI Secrets", url: "https://thethinkandgrowrich.com/aisecrets" },
    { name: "Downsell: AI Secrets (Discounted)", url: "https://thethinkandgrowrich.com/aisecrets-discounted" },
    { name: "Thank You Page", url: "https://thethinkandgrowrich.com/success" },
  ],
  "9b1b0228-9e7f-402d-91ee-8da7d0cfeb9b": [
    { name: "Calendar + Optin", url: "https://invest.titanassetmanagement.fund/fixed-yield-account" },
    { name: "Calendar + Optin", url: "https://invest.titanassetmanagement.fund/information-2" },
    { name: "Thank You", url: "https://invest.titanassetmanagement.fund/thank-you-2" },
    { name: "Thank You Page", url: "https://invest.titanassetmanagement.fund/thank-you" },
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    if (body.password !== PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("ORIGINAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("ORIGINAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results = {
      clients_upserted: 0,
      settings_upserted: 0,
      funnel_steps_synced: 0,
      errors: [] as string[],
    };

    // 1. Upsert all clients
    const { error: clientsError } = await supabase
      .from("clients")
      .upsert(clients, { onConflict: "id" });

    if (clientsError) {
      results.errors.push(`clients upsert: ${clientsError.message}`);
    } else {
      results.clients_upserted = clients.length;
    }

    // 2. Upsert all client_settings
    const { error: settingsError } = await supabase
      .from("client_settings")
      .upsert(clientSettings, { onConflict: "client_id" });

    if (settingsError) {
      results.errors.push(`client_settings upsert: ${settingsError.message}`);
    } else {
      results.settings_upserted = clientSettings.length;
    }

    // 3. Sync funnel steps per client
    for (const [clientId, steps] of Object.entries(clientFunnelSteps)) {
      if (steps.length === 0) continue;

      // Delete existing steps for this client
      const { error: delError } = await supabase
        .from("client_funnel_steps")
        .delete()
        .eq("client_id", clientId);

      if (delError) {
        results.errors.push(`funnel_steps delete for ${clientId}: ${delError.message}`);
        continue;
      }

      // Insert new steps
      const rows = steps.map((s, i) => ({
        client_id: clientId,
        name: s.name,
        url: s.url,
        sort_order: i,
      }));

      const { error: insError } = await supabase
        .from("client_funnel_steps")
        .insert(rows);

      if (insError) {
        results.errors.push(`funnel_steps insert for ${clientId}: ${insError.message}`);
      } else {
        results.funnel_steps_synced += steps.length;
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
