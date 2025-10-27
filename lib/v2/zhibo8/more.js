const got = require('@/utils/got');
const cheerio = require('cheerio');
const timezone = require('@/utils/timezone');
const { parseDate } = require('@/utils/parse-date');

const categories = {
    home: '首页',
    nba: 'NBA',
    zuqiu: '足球',
    dianjing: '电竞',
    other: '综合',
};

module.exports = async (ctx) => {
    const category = ctx.params.category ?? 'home';

    const rootUrl = 'https://news.zhibo8.cc';

    let list,
        apiUrl = '',
        currentUrl = '',
        response;

    if (category === 'home') {
        currentUrl = `https://m.zhibo8.com`;

        response = await got(currentUrl);

        const $ = cheerio.load(response.data);

        list = $('ul.news-lists li.news-item')
            .slice(0, ctx.query.limit ? Number.parseInt(ctx.query.limit) : 100)
            .toArray()
            .map((item) => {
                item = $(item);
                const url = item.find('a').attr('href');

                return {
                    title: item.find('div.title').text(),
                    link: `${currentUrl}${url}`,
                    pubDate: timezone(parseDate(url.split('/').at(-2)), +8),
                    category: item.attr('label').split(',').filter(Boolean),
                };
            });
    } else if (category === 'nba' || category === 'zuqiu') {
        currentUrl = `${rootUrl}/${category}/more.htm`;

        response = await got(currentUrl);

        const $ = cheerio.load(response.data);

        list = $('ul.articleList li')
            .slice(0, ctx.query.limit ? Number.parseInt(ctx.query.limit) : 100)
            .toArray()
            .map((item) => {
                item = $(item);
                const a = item.find('a');

                return {
                    title: a.text(),
                    link: `https:${a.attr('href')}`.replace(/^https?:\/\/news\.zhibo8\.com\//, 'https://m.zhibo8.com/news/web/'),
                    pubDate: timezone(parseDate(item.find('span.postTime').text()), +8),
                    category: item.attr('data-label').split(',').filter(Boolean),
                };
            });
    } else {
        currentUrl = `${rootUrl}/${category}`;
        apiUrl = `https://api.qiumibao.com/application/app/index.php?_url=/news/${category}List`;

        response = await got(apiUrl);

        list = response.data.data.list.map((item) => ({
            title: item.title,
            link: `https:${item.url}`.replace(/^https?:\/\/news\.zhibo8\.com\//, 'https://m.zhibo8.com/news/web/'),
            pubDate: timezone(parseDate(item.createtime), +8),
        }));
    }

    const items = await Promise.all(
        list.map((item) =>
            ctx.cache.tryGet(item.link, async () => {
                const res = await got(item.link);
                const content = cheerio.load(res.data);
                content('div.content img').remove();
                item.description = content('div.content').html();
                return item;
            })
        )
    );

    ctx.state.data = {
        title: `${categories[category]} - 直播吧`,
        link: currentUrl,
        item: items,
    };
};
