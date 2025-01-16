const got = require('@/utils/got');
const cheerio = require('cheerio');

const categories = {
    home: {
        title: '首页',
        data: 'res',
    },
    nba: {
        title: 'NBA',
        data: 'newsData',
    },
    cba: {
        title: 'CBA',
        data: 'newsData',
    },
    soccer: {
        title: '足球',
        data: 'news',
    },
};

module.exports = async (ctx) => {
    const category = ctx.params.category ?? 'home';

    const rootUrl = 'https://m.hupu.com';
    const currentUrl = `${rootUrl}/${category}`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const content = cheerio.load(response.data)
    const data = JSON.parse(content('#__NEXT_DATA__').html());

    let items = data.props.pageProps[categories[category].data].map((item) => ({
        title: item.title,
        link: item.url || item.link,
    }));

    items = await Promise.all(
        items
            .filter((item) => !/subject/.test(item.link))
            .map((item) =>
                ctx.cache.tryGet(item.link, async () => {
                    try {
                        const detailResponse = await got({
                            method: 'get',
                            url: item.link,
                        });

                        const content = cheerio.load(detailResponse.data);

                        item.author = content('.bbs-user-info-name, .bbs-user-wrapper-content-name-span').text();
                        item.category = content('.basketballTobbs_tag > a, .tag-player-team')
                            .toArray()
                            .map((c) => content(c).text());

                        content('.basketballTobbs_tag').remove();
                        content('.hupu-img').each(function () {
                            content(this)
                                .parent()
                                .html(`<img src="${content(this).attr('data-origin')}">`);
                        });

                        item.description = content('#bbs-thread-content, .bbs-content-font').html();
                    } catch {
                        // no-empty
                    }

                    return item;
                })
            )
    );

    ctx.state.data = {
        title: `虎扑 - ${categories[category].title}`,
        link: currentUrl,
        item: items,
    };
};
